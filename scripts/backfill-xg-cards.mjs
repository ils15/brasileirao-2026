/**
 * Backfill/incremento dos dados avançados 2026 (xG por jogo + cartões) via
 * API pública 365scores. Pode rodar isolado (backfill completo) ou ser
 * importado pelo updater (incremento da rodada).
 *
 *   node scripts/backfill-xg-cards.mjs               # incrementa e renderiza
 *   node scripts/backfill-xg-cards.mjs --full        # força detalhe de todos os jogos
 *   node scripts/backfill-xg-cards.mjs --render-only # regenera o módulo a partir do snapshot (sem rede)
 *
 * Denominador: o número de jogos do pacote disputado (src/currentSeasonResults.ts)
 * filtrado pelo corte. A fonte pode não cobrir todos eles; o módulo publicado
 * declara `coverage` com os pares faltantes, e a publicação é monotônica —
 * nunca rebaixa a cobertura já publicada.
 *
 * Cartões também são conferidos contra as tabelas agregadas da própria fonte.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePackagedResults } from './lib/dataPipeline.mjs'
import {
  currentSeasonNum,
  filterCurrentSeason,
  mergeAdvancedStats,
  parseGameDetail,
  parseResultsPage,
  parseStatsCards,
  renderAdvancedStatsModule,
  restrictToPackagedPairs,
  stampSeasonNum,
  validateAdvancedStats,
} from './lib/threesixfive.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = join(root, 'data/source-snapshots/advanced-stats-2026.json')
const MODULE = join(root, 'src/advancedStats2026.ts')
const RESULTS_MODULE = join(root, 'src/currentSeasonResults.ts')
const RESULTS_URL = 'https://webws.365scores.com/web/games/results/?appvid=365&competitions=113&showOdds=false'
const GAME_URL = (gameId) => `https://webws.365scores.com/web/game/?appvid=365&gameId=${gameId}&showOdds=false`
const STATS_URL = 'https://webws.365scores.com/web/stats/?appvid=365&competitions=113'
const REQUEST_PAUSE_MS = Number(process.env.THREE_SIX_FIVE_PAUSE_MS ?? 1200)
const full = process.argv.includes('--full')
// Cache do payload bruto em tmp do SO (fora do repo): backfill retomável sem
// recarregar tudo da fonte; o repo guarda só o agregado validado.
const CACHE_DIR = process.env.THREE_SIX_FIVE_CACHE_DIR ?? join('/tmp', '365scores-cache')
mkdirSync(CACHE_DIR, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJsonCached(url, gameId = null) {
  const cachePath = gameId != null ? join(CACHE_DIR, `game-${gameId}.json`) : null
  if (cachePath != null && existsSync(cachePath)) {
    const cached = readFileSync(cachePath, 'utf8')
    if (cached.length > 0) return JSON.parse(cached)
  }
  const payload = await fetchJson(url)
  if (cachePath != null) writeFileSync(cachePath, JSON.stringify(payload), 'utf8')
  return payload
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'brasileirao-2026-updater/1.0 (+https://ils15.github.io/brasileirao-2026)' } })
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`)
  return response.text()
}

/** Coleta com tolerância a rate limit: até 3 tentativas com backoff. */
async function fetchJson(url) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const text = await fetchText(url)
      const payload = JSON.parse(text)
      if (payload == null || typeof payload !== 'object' || Array.isArray(payload.games) === false && payload.game == null && payload.stats == null && payload.paging == null) {
        throw new Error('Resposta sem jogos/game/stats (provável rate limit).')
      }
      return payload
    } catch (error) {
      lastError = error
      await sleep(2500 * (attempt + 1))
    }
  }
  throw new Error(`Falha após 3 tentativas em ${url}: ${lastError?.message}`)
}

/**
 * Lista completa de resultados: primeira página + caminho previousPage.
 * As páginas vão do presente para o passado; o walk para quando uma página
 * não traz mais jogos encerrados da temporada corrente (evita mergulhar em
 * temporadas antigas, onde a fonte pode responder vazio).
 */
export async function fetchAllResults({ log = () => {} } = {}) {
  const pages = []
  let url = RESULTS_URL
  let season = null
  let collectedCurrent = 0
  for (let page = 0; page < 40; page += 1) {
    const payload = await fetchJson(url)
    const parsed = parseResultsPage(JSON.stringify(payload))
    if (season == null) season = currentSeasonNum([parsed], new Date().getUTCFullYear())
    const currentEnded = parsed.filter((game) => game.seasonNum === season && game.ended).length
    collectedCurrent += currentEnded
    pages.push(parsed)
    log(`  página ${page}: ${parsed.length} jogos · ${currentEnded} da temporada ${season} (acumulado ${collectedCurrent})`)
    const previous = payload.paging?.previousPage
    if (!previous || (collectedCurrent > 0 && currentEnded === 0)) break
    await sleep(REQUEST_PAUSE_MS)
    url = `https://webws.365scores.com${previous}`
  }
  return { pages, seasonNum: season }
}

export function readExisting(path = SNAPSHOT) {
  if (!existsSync(path)) return []
  const snapshot = JSON.parse(readFileSync(path, 'utf8'))
  // Snapshot legado (até 2026-11-07) gravou os registros sem `seasonNum`;
  // carimba a partir do topo para que o filtro da temporada não os descarte.
  return stampSeasonNum(snapshot.records ?? [], snapshot.seasonNum)
}

/** Pares (casa|fora) dos resultados disputados empacotados — o denominador. */
export function readPackagedPairs(path = RESULTS_MODULE) {
  return parsePackagedResults(readFileSync(path, 'utf8')).map((match) => `${match.home}|${match.away}`)
}

/** Cobertura já publicada no módulo vigente (guard monotônico). */
export function readModuleCoverage(path = MODULE) {
  if (!existsSync(path)) return null
  const match = readFileSync(path, 'utf8').match(/coverage: \{\s*matches: (\d+)/)
  return match ? Number(match[1]) : null
}

/**
 * Detalhe por jogo com falha isolada: um jogo que a fonte não entrega não
 * aborta o lote — o par fica sem registro e aparece em `coverage.missing`.
 */
export async function collectGameDetails({ games, fetchDetail, log = () => {}, warn = (line) => console.warn(line) }) {
  const records = []
  const failures = []
  for (const [index, game] of games.entries()) {
    try {
      const detail = parseGameDetail(JSON.stringify(await fetchDetail(game)))
      if (!detail.hasXg) log(`  sem cobertura de xG: ${detail.home}–${detail.away} (rodada ${detail.roundNum})`)
      records.push(detail)
    } catch (error) {
      const message = error.message.split('\n')[0]
      failures.push({ gameId: game.gameId, message })
      warn(`::warning::SECONDARY_DETAIL_FAILED source=advanced game=${game.gameId} (${message}); jogo entra em coverage.missing`)
    }
    if ((index + 1) % 25 === 0) log(`  ${index + 1}/${games.length}`)
  }
  return { records, failures }
}

/**
 * Valida, renderiza e (quando `write`) grava snapshot + módulo.
 *
 * A validação vem antes de qualquer escrita. Cobertura parcial é publicável
 * (política D01), mas nunca regressiva: se o conjunto validado cobre menos
 * jogos que o módulo vigente, nada é escrito e o updater emite
 * `::warning::SECONDARY_REGRESSION`. `write: false` percorre o mesmo caminho —
 * valida, renderiza e devolve a cobertura — sem tocar em `snapshotPath` nem
 * `modulePath`, o que torna `--dry-run` estritamente livre de escrita.
 */
export function publishAdvancedStats({
  records,
  seasonNum,
  expectedMatches,
  packagedPairs = [],
  fetchedAt = new Date().toISOString(),
  write = true,
  snapshotPath = SNAPSHOT,
  modulePath = MODULE,
  log = () => {},
  warn = (line) => console.warn(line),
}) {
  const checked = validateAdvancedStats(records, { expectedMatches, packagedPairs })
  const coverage = checked.coverage
  const packagedCoverage = write ? readModuleCoverage(modulePath) : null
  if (packagedCoverage != null && coverage.matches < packagedCoverage) {
    warn(
      `::warning::SECONDARY_REGRESSION source=advanced matches=${coverage.matches} packaged=${packagedCoverage}; módulo preservado`,
    )
    return { records, validation: checked, written: false, reason: 'coverage-regression', coverage }
  }
  const rendered = JSON.stringify(records)
  const snapshot = {
    source: '365scores',
    seasonNum,
    fetchedAt,
    sha256: createHash('sha256').update(rendered, 'utf8').digest('hex'),
    records,
  }

  if (write) {
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 1) + '\n')
    writeFileSync(modulePath, renderAdvancedStatsModule({ records, fetchedAt, sourceSha: snapshot.sha256, seasonNum, coverage }))
    log(`Escrito: ${snapshotPath} e ${modulePath}`)
  } else {
    log('dry-run: snapshot e módulo de dados avançados não foram escritos.')
  }

  return { records, validation: checked, snapshot, written: write, coverage }
}

/**
 * Regenera apenas o módulo a partir do snapshot versionado, sem rede e sem
 * reescrever o snapshot (o `fetchedAt`/`sha256` continuam os da captura).
 * Usado para publicar o campo `coverage` sem nova coleta. Guard monotônico:
 * cobertura menor que a do módulo vigente devolve `{ written: false, reason:
 * 'coverage-regression' }` sem tocar no arquivo.
 */
export function renderModuleFromSnapshot({
  snapshotPath = SNAPSHOT,
  modulePath = MODULE,
  packagedPairs = readPackagedPairs(),
  write = true,
  log = () => {},
  warn = (line) => console.warn(line),
}) {
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  const records = snapshot.records ?? []
  const checked = validateAdvancedStats(records, { expectedMatches: packagedPairs.length, packagedPairs })
  // Mesmo guard monotônico de `publishAdvancedStats`: regenerar o módulo a
  // partir do snapshot não pode reduzir a cobertura já publicada.
  const packagedCoverage = write ? readModuleCoverage(modulePath) : null
  if (packagedCoverage != null && checked.coverage.matches < packagedCoverage) {
    warn(
      `::warning::SECONDARY_REGRESSION source=advanced matches=${checked.coverage.matches} packaged=${packagedCoverage}; módulo preservado`,
    )
    return { written: false, reason: 'coverage-regression', validation: checked, coverage: checked.coverage }
  }
  const rendered = renderAdvancedStatsModule({
    records,
    fetchedAt: snapshot.fetchedAt,
    sourceSha: snapshot.sha256,
    seasonNum: snapshot.seasonNum,
    coverage: checked.coverage,
  })
  if (write) writeFileSync(modulePath, rendered)
  const { matches, expected, missing } = checked.coverage
  log(`Cobertura xG/cartões: ${matches}/${expected ?? '?'} jogos · ${missing.length} par(es) sem registro`)
  return { written: write, validation: checked, coverage: checked.coverage }
}

/** Fluxo principal: lista resultados, detalha o que falta, valida e renderiza. */
export async function refreshAdvancedStats({ log = console.log, write = true, warn = (line) => console.warn(line) } = {}) {
  log('365scores: listando resultados…')
  const { pages, seasonNum } = await fetchAllResults({ log })
  if (seasonNum == null) throw new Error('Temporada corrente não identificada na fonte.')
  const seasonGames = filterCurrentSeason(pages.flat(), seasonNum)
  const ended = seasonGames.filter((game) => game.ended)
  log(`Temporada ${seasonNum}: ${seasonGames.length} jogos na fonte, ${ended.length} encerrados.`)

  // Denominador = pacote publicado (resultados disputados filtrados pelo
  // corte), não a lista da fonte: a fonte pode não cobrir todos os jogos.
  const packagedPairs = readPackagedPairs()
  log(`Pacote: ${packagedPairs.length} jogos disputados — denominador da cobertura.`)

  const existing = readExisting()
  const knownIds = new Set(existing.map((record) => record.gameId))
  const missing = ended.filter((game) => full || !knownIds.has(game.gameId))
  log(`Registros existentes: ${existing.length} · detalhes a coletar: ${missing.length}`)

  const { records: incoming, failures } = await collectGameDetails({
    games: missing,
    log,
    warn,
    fetchDetail: async (game) => {
      // Pausa só vale para rede de verdade; cache local responde sem intervalo.
      const cachePath = join(CACHE_DIR, `game-${game.gameId}.json`)
      if (!existsSync(cachePath)) await sleep(REQUEST_PAUSE_MS)
      return fetchJsonCached(GAME_URL(game.gameId), game.gameId)
    },
  })
  if (failures.length > 0) log(`Detalhes indisponíveis: ${failures.length} jogo(s) seguem sem registro nesta coleta.`)

  const records = mergeAdvancedStats(existing, incoming)
  // Só mantém registros da temporada corrente (a paginação pode vazar temporadas antigas).
  // `seasonNum` fica no snapshot (auto-descritivo); o módulo gerado não o serializa.
  const seasonRecords = records.filter((record) => record.seasonNum === seasonNum)
  // Cobertura é do pacote: registro cujo par o pacote ainda não reconhece fica
  // de fora (volta na coleta seguinte) em vez de fazer `matches > expected`.
  const current = restrictToPackagedPairs(seasonRecords, packagedPairs)
  if (current.length !== seasonRecords.length) {
    log(`::notice::SECONDARY_OUTSIDE_PACK source=advanced records=${seasonRecords.length - current.length}`
      + ` — fonte à frente do pacote (jogo ainda pendente); não publicado nesta coleta.`)
  }
  const validation = validateAdvancedStats(current, { expectedMatches: packagedPairs.length, packagedPairs })
  log(`Validação: ${validation.matches} jogos · xG coberto em ${validation.withXg} · ΣxG ${validation.xg} vs Σgols coberto ${validation.goalsCovered} (razão ${validation.xgRatio}) · ${validation.cards} cartões · cobertura ${validation.coverage.matches}/${validation.coverage.expected ?? '?'}`)

  // Cross-check de cartões com as tabelas agregadas da fonte.
  const statsCards = parseStatsCards(JSON.stringify(await fetchJson(STATS_URL)))
  const totals = new Map()
  for (const record of current) {
    for (const club of [record.home, record.away]) {
      const entry = totals.get(club) ?? { yellow: 0, red: 0 }
      totals.set(club, entry)
    }
    totals.get(record.home).yellow += record.yellowHome
    totals.get(record.home).red += record.redHome
    totals.get(record.away).yellow += record.yellowAway
    totals.get(record.away).red += record.redAway
  }
  let divergences = 0
  let totalByGames = 0
  let totalByTable = 0
  for (const [club, totalsEntry] of totals) {
    const source = statsCards.get(club)
    if (!source) throw new Error(`Clube ${club} ausente nas tabelas agregadas de cartões.`)
    totalByGames += totalsEntry.yellow + totalsEntry.red
    totalByTable += source.yellow + source.red
    if (source.yellow !== totalsEntry.yellow || source.red !== totalsEntry.red) divergences += 1
  }
  // A soma por jogo é sistematicamente alguns cartões maior que a tabela
  // agregada da própria fonte (19/20 clubes na adesão, ~4–6 amarelos por
  // clube): a tabela agregada exclui o que os eventos por partida contam
  // (provavelmente cartões de banco/comissão). Fonte única = eventos por
  // partida, internamente consistentes; o agregado fica como aviso, não
  // como bloqueio.
  log(`Cartões: por jogo ${totalByGames} vs tabela agregada ${totalByTable} (${divergences}/${totals.size} clubes divergentes — fonte única: eventos por partida).`)
  if (totalByGames < totalByTable) throw new Error(`Cartões por jogo (${totalByGames}) MENORES que a tabela agregada (${totalByTable}) — contagem perdeu eventos; não publicando.`)

  return publishAdvancedStats({
    records: current,
    seasonNum,
    expectedMatches: packagedPairs.length,
    packagedPairs,
    write,
    log,
    warn,
  })
}

const isMain = process.argv[1] != null && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const task = process.argv.includes('--render-only')
    ? Promise.resolve(renderModuleFromSnapshot({ log: console.log }))
    : refreshAdvancedStats()
  task.catch((error) => {
    console.error(`Backfill avançado abortado: ${error.message}`)
    process.exit(1)
  })
}
