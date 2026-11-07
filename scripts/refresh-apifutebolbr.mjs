/**
 * Coleta incremental da API Futebol BR (Bearer key): artilharia da edição
 * atual + conciliação da tabela + preenchimento "em segundo plano" dos
 * detalhes de partidas (cartões por partida) ao longo dos ciclos do updater
 * — sem pressa, respeitando o orçamento diário da chave.
 *
 *   node scripts/refresh-apifutebolbr.mjs            # usa API_FUTEBOL_BR_KEY
 *   API_FUTEBOL_BR_PER_RUN=50 node ...               # orçamento maior por ciclo
 *
 * Sem a key, sai silenciosamente (o painel de artilharia mantém o snapshot).
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMatchCards, parseScorers, parseTable, reconcileTable, mergeMatches, renderScorersModule } from './lib/apifutebolbr.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://api.api-futebol.com.br/v1'
const SNAPSHOT_DIR = join(root, 'data/source-snapshots')
const SCORERS_SNAPSHOT = join(SNAPSHOT_DIR, 'apifb-artilharia-2026.json')
const MATCHES_SNAPSHOT = join(SNAPSHOT_DIR, 'apifb-partidas-2026.json')
const SCORERS_MODULE = join(root, 'src/scorers2026.ts')
const PER_RUN = Number(process.env.API_FUTEBOL_BR_PER_RUN ?? 25)
const REQUEST_PAUSE_MS = Number(process.env.API_FUTEBOL_BR_PAUSE_MS ?? 700)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(path, key) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${key}`, 'user-agent': 'brasileirao-2026-updater/1.0' },
  })
  if (!response.ok) throw new Error(`API Futebol BR ${path}: HTTP ${response.status}`)
  return response.json()
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Rodadas encerradas na ordem de coleta: mais recentes primeiro (relevantes
 * para o cross-check dos jogos que decidem vaga), e no máximo algumas por
 * ciclo — cada listagem custa 1 requisição do orçamento.
 */
function pendingEnclosedRounds(rodadasList, { maxRounds = 4 } = {}) {
  return rodadasList
    .filter((rodada) => rodada.status === 'encerrada')
    .map((rodada) => Number(rodada.rodada) || 0)
    .filter((rodada) => rodada > 0)
    .sort((left, right) => right - left)
    .slice(0, maxRounds)
}

export async function refreshApiFutebolBr({ log = console.log, ourStandings = [] } = {}) {
  const key = process.env.API_FUTEBOL_BR_KEY
  if (!key) {
    log('API Futebol BR: sem API_FUTEBOL_BR_KEY; mantendo snapshot anterior.')
    return
  }

  // 1. Artilharia (1 requisição) + render do módulo de goleadores.
  const scorers = parseScorers(JSON.stringify(await fetchJson('/campeonatos/10/artilharia', key)))
  await sleep(REQUEST_PAUSE_MS)
  const scorersSha = createHash('sha256').update(JSON.stringify(scorers), 'utf8').digest('hex')
  const scorersSnapshot = { source: 'API Futebol BR', fetchedAt: new Date().toISOString(), sha256: scorersSha, scorers }
  writeFileSync(SCORERS_SNAPSHOT, JSON.stringify(scorersSnapshot, null, 1) + '\n')
  writeFileSync(SCORERS_MODULE, renderScorersModule({ scorers, fetchedAt: scorersSnapshot.fetchedAt, sourceSha: scorersSha }))
  log(`Artilharia: ${scorers.length} atletas · líder ${scorers[0].name} (${scorers[0].goals} gols) · Σgols ${scorers.reduce((sum, scorer) => sum + scorer.goals, 0)}`)

  // 2. Conciliação da tabela (1 requisição) — fonte independente dos nossos placares.
  if (ourStandings.length > 0) {
    try {
      const apiRows = parseTable(JSON.stringify(await fetchJson('/campeonatos/10/tabela', key)))
      const ourRows = ourStandings.map((row) => ({ club: row.id ?? row.club, points: row.points, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst }))
      const reconciliation = reconcileTable(apiRows, ourRows)
      log(`Conciliação API Futebol BR: ${reconciliation.divergences} divergência(s)${reconciliation.report.length > 0 ? ` — ${reconciliation.report.slice(0, 5).join('; ')}` : ''}`)
    } catch (error) {
      log(`  Tabela da API indisponível nesta coleta (${error.message.split('\n')[0]})`)
    }
  }

  // 3. Preenchimento em segundo plano dos detalhes de partida (cartões por
  //    partida, cross-check com 365scores). Orçamento por ciclo respeitado.
  //    A chave de dedup é par+placar: cada par ordenado acontece DUAS vezes
  //    na temporada (casa/fora), então o par sozinho não basta.
  const snapshot = readJson(MATCHES_SNAPSHOT, { matches: [] })
  let budget = PER_RUN
  const incoming = []
  try {
    const rodadasPayload = await fetchJson('/campeonatos/10/rodadas', key)
    budget -= 1
    const covered = new Set(snapshot.matches.map((match) => `${match.home}|${match.away}|${match.homeGoals}-${match.awayGoals}`))
    for (const roundNumber of pendingEnclosedRounds(rodadasPayload)) {
      if (budget <= 0) break
      await sleep(REQUEST_PAUSE_MS)
      const roundPayload = await fetchJson(`/campeonatos/10/rodadas/${roundNumber}`, key)
      budget -= 1
      const games = Array.isArray(roundPayload.partidas) ? roundPayload.partidas : []
      for (const game of games) {
        if (budget <= 0) break
        if (game.status !== 'finalizado') continue
        const homeName = game.time_mandante?.nome_popular
        const awayName = game.time_visitante?.nome_popular
        if (homeName == null || awayName == null) continue
        const coverageKey = `${homeName}|${awayName}|${game.placar_mandante}-${game.placar_visitante}`
        if (covered.has(coverageKey)) continue
        await sleep(REQUEST_PAUSE_MS)
        incoming.push(parseMatchCards(JSON.stringify(await fetchJson(`/partidas/${game.partida_id}`, key))))
        budget -= 1
      }
    }
  } catch (error) {
    log(`  Partidas da API Futebol BR indisponíveis nesta coleta (${error.message.split('\n')[0]}); mantendo ${snapshot.matches.length} coletadas.`)
  }

  if (incoming.length > 0) {
    const merged = mergeMatches(snapshot.matches, incoming)
    writeFileSync(MATCHES_SNAPSHOT, JSON.stringify({ source: 'API Futebol BR', fetchedAt: new Date().toISOString(), matches: merged }, null, 1) + '\n')
    log(`Partidas coletadas: +${incoming.length} (total ${merged.length}) · orçamento restante no ciclo: ${budget}`)
    crossCheckCards(merged, { log })
  }
}

/** Cross-check informacional de cartões: 365scores (por partida) vs API Futebol BR. */
function crossCheckCards(apfbMatches, { log }) {
  const advancedPath = join(SNAPSHOT_DIR, 'advanced-stats-2026.json')
  if (!existsSync(advancedPath)) return
  const advanced = JSON.parse(readFileSync(advancedPath, 'utf8')).records ?? []
  const byPair = new Map(advanced.map((record) => [`${record.home}|${record.away}|${record.homeScore}-${record.awayScore}`, record]))
  let compared = 0
  let yellowDelta = 0
  let redDelta = 0
  for (const match of apfbMatches) {
    const record = byPair.get(`${match.home}|${match.away}|${match.homeGoals}-${match.awayGoals}`)
    if (!record) continue
    compared += 1
    yellowDelta += Math.abs(match.yellowHome - record.yellowHome) + Math.abs(match.yellowAway - record.yellowAway)
    redDelta += Math.abs(match.redHome - record.redHome) + Math.abs(match.redAway - record.redAway)
  }
  if (compared > 0) {
    log(`  Cross-check cartões (${compared} partidas em comum): Δamarelos ${yellowDelta}, Δvermelhos ${redDelta} — fontes divergem em critérios de contagem; 365scores permanece a fonte do desempate.`)
  }
}

const isMain = process.argv[1] != null && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  refreshApiFutebolBr().catch((error) => {
    console.error(`API Futebol BR abortada: ${error.message}`)
    process.exit(1)
  })
}
