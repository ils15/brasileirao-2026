/**
 * Artilharia 2026 derivada dos eventos de partida da ESPN.
 *
 * Substitui a coleta da API Futebol BR (trial encerrado, 429 permanente).
 * Para cada resultado já empacotado, resolve o eventId no scoreboard da
 * temporada, baixa o summary UMA vez e guarda o payload normalizado em
 * data/source-snapshots/espn-events-<eventId>.json. O módulo
 * src/scorers2026.ts é regenerado a partir dos snapshots — nunca da rede
 * direto — para que a coleta seja reprocessável e auditável.
 *
 * Falha por partida é isolada: emite ::warning:: com o eventId, mantém o
 * snapshot anterior e não preenche nada com zero. Se a cobertura regredir
 * (menos partidas que o módulo vigente), o módulo atual é preservado.
 *
 * Uso:
 *   node scripts/refresh-espn-scorers.mjs              # incremental pós-rodada
 *   node scripts/refresh-espn-scorers.mjs --offline    # só snapshots locais
 *   node scripts/refresh-espn-scorers.mjs --dry-run    # não escreve
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  aggregatePlayerStats,
  compareCardTotals,
  ESPN_SCOREBOARD_URL,
  fetchMatchEvents,
  parseSeasonScoreboard,
  renderMatchSnapshot,
  renderScorersModule,
} from './lib/espnMatchEvents.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SNAPSHOTS_DIR = join(root, 'data/source-snapshots')
const DEFAULT_MODULE_PATH = join(root, 'src/scorers2026.ts')
const INDEX_FILENAME = 'espn-event-index-2026.json'
const SNAPSHOT_RE = /^espn-events-\d+\.json$/
const CONCURRENCY = Number(process.env.ESPN_SCORERS_CONCURRENCY ?? 6)

/** Resultados empacotados (src/currentSeasonResults.ts) no formato do pipeline. */
export function readPackagedResults(modulePath = join(root, 'src/currentSeasonResults.ts')) {
  const source = readFileSync(modulePath, 'utf8')
  return source
    .split('\n')
    .filter((line) => line.trim().startsWith('{ home:'))
    .map((line) => {
      const match = line.match(
        /home: "([^"]+)", away: "([^"]+)", homeGoals: (\d+), awayGoals: (\d+), kickoff: "([^"]+)", source: "([^"]+)", sourceRef: "([^"]+)"/,
      )
      if (!match) throw new Error(`Linha de resultado não parseável: ${line}`)
      return {
        home: match[1],
        away: match[2],
        homeGoals: Number(match[3]),
        awayGoals: Number(match[4]),
        kickoff: match[5],
        source: match[6],
        sourceRef: match[7],
      }
    })
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

async function loadSeasonIndex({ snapshotsDir, fetchImpl, allowNetwork, write, log }) {
  const path = join(snapshotsDir, INDEX_FILENAME)
  if (allowNetwork) {
    const url = `${ESPN_SCOREBOARD_URL}?dates=2026&limit=500`
    const response = await fetchImpl(url, { headers: { 'user-agent': 'brasileirao-2026-updater/1.0' } })
    if (!response.ok) throw new Error(`ESPN scoreboard: HTTP ${response.status}`)
    const jsonText = await response.text()
    const byPair = parseSeasonScoreboard(jsonText)
    const events = [...byPair.values()].flat().sort((left, right) => left.eventId.localeCompare(right.eventId))
    // O índice é cache: reescrever só quando a lista de eventos muda evita
    // diff de timestamp a cada ciclo (o módulo não pode oscilar sem dado novo).
    const previousEvents = existsSync(path) ? JSON.stringify(JSON.parse(readFileSync(path, 'utf8')).events) : null
    if (write && previousEvents !== JSON.stringify(events)) {
      const payload = {
        source: 'ESPN',
        endpoint: 'site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=2026',
        fetchedAt: new Date().toISOString(),
        events,
      }
      writeFileSync(path, `${JSON.stringify(payload, null, 1)}\n`)
    }
    return byPair
  }
  if (!existsSync(path)) throw new Error(`--offline exige snapshot local ausente: data/source-snapshots/${INDEX_FILENAME}`)
  log(`ESPN: usando índice local de eventos (${INDEX_FILENAME})`)
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  const byPair = new Map()
  for (const event of payload.events ?? []) {
    const key = `${event.home}:${event.away}`
    const list = byPair.get(key) ?? []
    list.push(event)
    byPair.set(key, list)
  }
  return byPair
}

/** Melhor evento para um resultado empacotado: mesmo par, encerrado e mesmo placar. */
export function resolveEventId(byPair, result) {
  const candidates = byPair.get(`${result.home}:${result.away}`) ?? []
  const exact = candidates.find(
    (event) => event.completed && event.homeScore === result.homeGoals && event.awayScore === result.awayGoals,
  )
  return exact?.eventId ?? null
}

/** Hash determinístico do conjunto de snapshots (procedência do módulo). */
export function snapshotsSha(payloads) {
  const canonical = payloads
    .map((payload) => JSON.stringify(payload))
    .sort()
    .join('\n')
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

function readPackagedCoverage(modulePath) {
  if (!existsSync(modulePath)) return null
  const match = readFileSync(modulePath, 'utf8').match(/matchesCovered: (\d+)/)
  return match ? Number(match[1]) : null
}

function readAdvancedRecords(snapshotsDir) {
  const path = join(snapshotsDir, 'advanced-stats-2026.json')
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf8')).records ?? []
}

/**
 * Coleta incremental + regeneração do módulo. Idempotente: snapshots de
 * partidas já capturadas não são rebaixados nem sobrescritos.
 */
export async function refreshEspnScorers({
  results = readPackagedResults(),
  snapshotsDir = DEFAULT_SNAPSHOTS_DIR,
  modulePath = DEFAULT_MODULE_PATH,
  fetchImpl = fetch,
  allowNetwork = true,
  write = true,
  log = console.log,
  warn = (line) => console.warn(line),
  concurrency = CONCURRENCY,
} = {}) {
  const byPair = await loadSeasonIndex({ snapshotsDir, fetchImpl, allowNetwork, write, log })

  const pending = []
  const unresolvedMatches = []
  for (const result of results) {
    const eventId = resolveEventId(byPair, result)
    if (!eventId) {
      unresolvedMatches.push(result)
      continue
    }
    const snapshotPath = join(snapshotsDir, `espn-events-${eventId}.json`)
    if (existsSync(snapshotPath)) continue
    pending.push({ eventId, snapshotPath })
  }

  for (const result of unresolvedMatches) {
    warn(`::warning::ESPN sem evento encerrado com placar ${result.homeGoals}-${result.awayGoals} para ${result.home} x ${result.away}; partida fora da artilharia`)
  }

  log(`ESPN: ${results.length} resultados empacotados · ${results.length - pending.length - unresolvedMatches.length} já capturados · ${pending.length} a capturar`)

  let captured = 0
  const failures = []
  const capturedSnapshots = []
  await mapWithConcurrency(pending, concurrency, async ({ eventId, snapshotPath }) => {
    try {
      const parsed = await fetchMatchEvents(eventId, { fetchImpl })
      if (String(parsed.eventId) !== String(eventId)) {
        throw new Error(`resposta do evento ${parsed.eventId} para requisição do evento ${eventId}`)
      }
      const snapshot = renderMatchSnapshot(parsed, { fetchedAt: new Date().toISOString() })
      if (write) writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 1)}\n`)
      capturedSnapshots.push(snapshot)
      captured += 1
    } catch (error) {
      failures.push({ eventId, message: error.message.split('\n')[0] })
      warn(`::warning::ESPN falhou para o evento ${eventId} (${error.message.split('\n')[0]}); snapshot anterior mantido`)
    }
  })

  // Agregação sempre sobre o conjunto completo: snapshots em disco + capturas
  // do ciclo ainda em memória (dry-run produz a mesma cobertura sem escrever).
  const byEventId = new Map()
  for (const snapshot of capturedSnapshots) byEventId.set(snapshot.eventId, snapshot)
  for (const file of readdirSync(snapshotsDir).filter((name) => SNAPSHOT_RE.test(name)).sort()) {
    const snapshot = JSON.parse(readFileSync(join(snapshotsDir, file), 'utf8'))
    byEventId.set(snapshot.eventId, snapshot)
  }
  const snapshots = [...byEventId.values()]

  if (snapshots.length === 0) {
    warn('::warning::ESPN: nenhum snapshot de eventos disponível; artilharia mantida como está')
    return { written: false, captured, failures, coverage: null }
  }

  const aggregation = aggregatePlayerStats(snapshots)
  const packagedCoverage = readPackagedCoverage(modulePath)
  if (packagedCoverage != null && aggregation.coverage.matchesCovered < packagedCoverage) {
    warn(
      `::warning::ESPN: cobertura ${aggregation.coverage.matchesCovered} < módulo vigente ${packagedCoverage}; artilharia preservada`,
    )
    return { written: false, captured, failures, coverage: aggregation.coverage }
  }

  const sha = snapshotsSha(snapshots)
  const current = existsSync(modulePath) ? readFileSync(modulePath, 'utf8') : ''
  if (current.includes(`sha256: '${sha}'`)) {
    log(`ESPN: artilharia sem mudança (${aggregation.scorers.length} atletas · Σgols ${aggregation.coverage.goalsAttributed}/${aggregation.coverage.goalsInPackage})`)
    return { written: false, captured, failures, coverage: aggregation.coverage }
  }

  const moduleText = renderScorersModule({
    scorers: aggregation.scorers,
    fetchedAt: new Date().toISOString(),
    sourceSha: sha,
    coverage: aggregation.coverage,
  })
  if (write) writeFileSync(modulePath, moduleText)

  log(
    `ESPN: artilharia ${aggregation.scorers.length} atletas · líder ${aggregation.scorers[0]?.player ?? '—'} (${aggregation.scorers[0]?.goals ?? 0} gols) · Σgols ${aggregation.coverage.goalsAttributed}/${aggregation.coverage.goalsInPackage} · partidas ${aggregation.coverage.matchesCovered} · gol contra ${aggregation.coverage.ownGoals} · sem atleta ${aggregation.coverage.unresolved}`,
  )
  for (const eventId of aggregation.coverage.mismatchedMatches.slice(0, 10)) {
    warn(`::warning::ESPN: eventos de ${eventId} não fecham com o placar empacotado; gols faltantes ficam fora da artilharia`)
  }

  // Corroboração (log): cartões por partida ESPN × 365scores. Nunca fonte do produto.
  const comparison = compareCardTotals(snapshots, readAdvancedRecords(snapshotsDir))
  if (comparison.compared > 0) {
    log(
      `  Cross-check cartões ESPN × 365scores (${comparison.compared} partidas em comum): Δcartões ${comparison.yellowDelta} — fontes divergem em critério; 365scores permanece a fonte do produto.`,
    )
  }

  return { written: write, captured, failures, coverage: aggregation.coverage }
}

const isMain = process.argv[1] != null && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const argv = new Set(process.argv.slice(2))
  refreshEspnScorers({ allowNetwork: !argv.has('--offline'), write: !argv.has('--dry-run') })
    .then(({ written, captured }) => {
      console.log(`ESPN: ${captured} partida(s) capturada(s) · módulo ${written ? 'atualizado' : 'preservado'}`)
    })
    .catch((error) => {
      console.error(`ESPN artilharia abortada: ${error.message}`)
      process.exit(1)
    })
}
