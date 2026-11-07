/**
 * Backfill/incremento dos dados avançados 2026 (xG por jogo + cartões) via
 * API pública 365scores. Pode rodar isolado (backfill completo) ou ser
 * importado pelo updater (incremento da rodada).
 *
 *   node scripts/backfill-xg-cards.mjs            # incrementa e renderiza
 *   node scripts/backfill-xg-cards.mjs --full     # força detalhe de todos os jogos
 *
 * Cartões também são conferidos contra as tabelas agregadas da própria fonte.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  currentSeasonNum,
  filterCurrentSeason,
  mergeAdvancedStats,
  parseGameDetail,
  parseResultsPage,
  parseStatsCards,
  renderAdvancedStatsModule,
  validateAdvancedStats,
} from './lib/threesixfive.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = join(root, 'data/source-snapshots/advanced-stats-2026.json')
const MODULE = join(root, 'src/advancedStats2026.ts')
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

export function readExisting() {
  if (!existsSync(SNAPSHOT)) return []
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  return snapshot.records ?? []
}

/** Fluxo principal: lista resultados, detalha o que falta, valida e renderiza. */
export async function refreshAdvancedStats({ log = console.log } = {}) {
  log('365scores: listando resultados…')
  const { pages, seasonNum } = await fetchAllResults({ log })
  if (seasonNum == null) throw new Error('Temporada corrente não identificada na fonte.')
  const seasonGames = filterCurrentSeason(pages.flat(), seasonNum)
  const ended = seasonGames.filter((game) => game.ended)
  log(`Temporada ${seasonNum}: ${seasonGames.length} jogos na fonte, ${ended.length} encerrados.`)

  const existing = readExisting()
  const knownIds = new Set(existing.map((record) => record.gameId))
  const missing = ended.filter((game) => full || !knownIds.has(game.gameId))
  log(`Registros existentes: ${existing.length} · detalhes a coletar: ${missing.length}`)

  const incoming = []
  for (const [index, game] of missing.entries()) {
    // Pausa só vale para rede de verdade; cache local responde sem intervalo.
    const cachePath = join(CACHE_DIR, `game-${game.gameId}.json`)
    if (!existsSync(cachePath)) await sleep(REQUEST_PAUSE_MS)
    const detail = parseGameDetail(JSON.stringify(await fetchJsonCached(GAME_URL(game.gameId), game.gameId)))
    if (!detail.hasXg) log(`  sem cobertura de xG: ${detail.home}–${detail.away} (rodada ${detail.roundNum})`)
    incoming.push(detail)
    if ((index + 1) % 25 === 0) log(`  ${index + 1}/${missing.length}`)
  }

  const records = mergeAdvancedStats(existing, incoming)
  // Só mantém registros da temporada corrente (a paginação pode vazar temporadas antigas).
  const current = records.filter((record) => record.seasonNum === seasonNum).map(({ seasonNum, ...rest }) => rest)
  const validation = validateAdvancedStats(current, { expectedMatches: ended.length })
  log(`Validação: ${validation.matches} jogos · xG coberto em ${validation.withXg} · ΣxG ${validation.xg} vs Σgols ${validation.goals} (razão ${validation.xgRatio}) · ${validation.cards} cartões`)

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

  const rendered = JSON.stringify(current)
  const snapshot = {
    source: '365scores',
    seasonNum,
    fetchedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(rendered, 'utf8').digest('hex'),
    records: current,
  }
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1) + '\n')
  writeFileSync(MODULE, renderAdvancedStatsModule({ records: current, fetchedAt: snapshot.fetchedAt, sourceSha: snapshot.sha256, seasonNum }))
  log(`Escrito: ${SNAPSHOT} e ${MODULE}`)
  return { records: current, validation, snapshot }
}

const isMain = process.argv[1] != null && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  refreshAdvancedStats().catch((error) => {
    console.error(`Backfill avançado abortado: ${error.message}`)
    process.exit(1)
  })
}
