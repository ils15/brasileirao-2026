/**
 * Eventos de partida da ESPN (gols e cartões por atleta) — fonte da artilharia
 * do painel.
 *
 * Endpoint: site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=<id>
 * Extrai de `keyEvents`:
 *  - gols  → { athlete, club, minute, penalty }
 *  - cartões → { athlete, club, type: 'yellow' | 'red', minute }
 *
 * Política de tolerância: evento sem atleta identificável NÃO inventa nome —
 * entra em `unresolved` e o chamador decide (warn). Gol contra não é
 * atribuído a artilheiro: conta em `ownGoals` (o placar fecha, o atleta não).
 *
 * Escopo do dado: a ESPN NÃO publica assistências nos eventos de partida.
 * O shape do módulo gerado omite o campo e declara `assists: 'unavailable'`.
 */

import { ESPN_NAME_SLUGS } from './dataPipeline.mjs'

export const ESPN_SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary'
export const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard'

const GOAL_TYPES = new Set(['goal'])
const OWN_GOAL_TYPES = new Set(['own-goal'])
const YELLOW_TYPES = new Set(['yellow-card'])
const RED_TYPES = new Set(['red-card', 'yellow-red-card'])

/**
 * A ESPN codifica o método do gol no próprio tipo: "goal", "goal---header",
 * "goal---volley", "goal---penalty" e o pênalti convertido como
 * "penalty---scored". Só o prefixo com três hífens é gol — assim "goal-kick"
 * (tiro de meta) não entra — e "penalty---saved"/"penalty---missed" ficam fora.
 */
function isGoalEvent(event) {
  const key = typeKey(event)
  return GOAL_TYPES.has(key) || key === 'penalty---scored' || key.startsWith('goal---')
}

function isOwnGoalEvent(event) {
  return OWN_GOAL_TYPES.has(typeKey(event)) || typeText(event) === 'Own Goal'
}

/**
 * O scoreboard da temporada usa rótulos que divergem do summary diário para
 * o mesmo clube ("Athletico-PR" × "Athletico Paranaense"). O alias é local:
 * o mapa compartilhado do pipeline continua sendo a fonte dos nomes diários.
 */
const CLUB_ALIASES = {
  'Athletico-PR': 'athletico-pr',
}

function clubSlug(displayName) {
  const slug = CLUB_ALIASES[displayName] ?? ESPN_NAME_SLUGS[displayName]
  if (!slug) throw new Error(`Time da ESPN sem slug conhecido: "${displayName}". Atualize ESPN_NAME_SLUGS.`)
  return slug
}

function typeText(event) {
  return String(event?.type?.text ?? '')
}

function typeKey(event) {
  return String(event?.type?.type ?? '')
}

/** 'yellow' | 'red' | null — "Second Yellow Card" conta como vermelho. */
function cardColor(event) {
  const key = typeKey(event)
  const text = typeText(event)
  if (RED_TYPES.has(key) || /red card/i.test(text)) return 'red'
  if (YELLOW_TYPES.has(key) || /yellow card/i.test(text)) return 'yellow'
  return null
}

function minuteOf(event) {
  const display = event?.clock?.displayValue
  return typeof display === 'string' && display.length > 0 ? display : null
}

function athleteNameOf(event) {
  const participants = Array.isArray(event?.participants) ? event.participants : []
  for (const participant of participants) {
    const name = participant?.athlete?.displayName
    if (typeof name === 'string' && name.trim().length > 0) return name.trim()
  }
  return null
}

/**
 * Payload do summary ESPN → partida normalizada.
 * Lança quando falta competição/eventId ou quando o time não tem slug: dado
 * de clube é estrutural do projeto, não se adivinha.
 */
export function parseMatchEvents(jsonText, { eventId } = {}) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  const competition = payload?.header?.competitions?.[0]
  if (!competition) throw new Error('Summary ESPN sem header.competitions[0].')
  const id = competition.id != null ? String(competition.id) : eventId != null ? String(eventId) : null
  if (!id) throw new Error('Summary ESPN sem eventId (competition.id ausente).')

  const competitors = Array.isArray(competition.competitors) ? competition.competitors : []
  const homeTeam = competitors.find((entry) => entry.homeAway === 'home')
  const awayTeam = competitors.find((entry) => entry.homeAway === 'away')
  if (!homeTeam || !awayTeam) throw new Error(`Summary ESPN ${id} sem mandante/visitante.`)

  const goals = []
  const cards = []
  const ownGoals = []
  const unresolved = []
  const events = Array.isArray(payload.keyEvents) ? payload.keyEvents : []

  for (const event of events) {
    const key = typeKey(event)
    const color = cardColor(event)
    const name = athleteNameOf(event)
    const teamName = event?.team?.displayName

    if (color != null) {
      if (!name) {
        unresolved.push({ kind: `${color}-card`, reason: 'no-athlete', text: String(event?.text ?? '') })
        continue
      }
      if (!teamName) {
        unresolved.push({ kind: `${color}-card`, reason: 'no-team', text: String(event?.text ?? '') })
        continue
      }
      cards.push({ athlete: name, club: clubSlug(teamName), type: color, minute: minuteOf(event) })
      continue
    }

    const goal = isGoalEvent(event)
    const ownGoal = isOwnGoalEvent(event)
    if (!goal && !ownGoal) continue

    if (!name) {
      unresolved.push({ kind: ownGoal ? 'own-goal' : 'goal', reason: 'no-athlete', text: String(event?.text ?? '') })
      continue
    }
    if (!teamName) {
      unresolved.push({ kind: ownGoal ? 'own-goal' : 'goal', reason: 'no-team', text: String(event?.text ?? '') })
      continue
    }
    const entry = { athlete: name, club: clubSlug(teamName), minute: minuteOf(event) }
    if (ownGoal) {
      ownGoals.push(entry)
      continue
    }
    goals.push({ ...entry, penalty: /penalty/i.test(String(event?.text ?? '')) })
  }

  const homeGoals = Number(homeTeam.score)
  const awayGoals = Number(awayTeam.score)
  return {
    eventId: id,
    date: competition.date ?? null,
    status: competition.status?.type?.state ?? null,
    home: clubSlug(homeTeam.team?.displayName),
    away: clubSlug(awayTeam.team?.displayName),
    homeGoals,
    awayGoals,
    goals,
    ownGoals,
    cards,
    unresolved,
  }
}

/** Busca o summary de uma partida. `fetchImpl` é injetável para teste sem rede. */
export async function fetchMatchEvents(eventId, { fetchImpl = fetch } = {}) {
  const url = `${ESPN_SUMMARY_URL}?event=${encodeURIComponent(String(eventId))}`
  const response = await fetchImpl(url, { headers: { 'user-agent': 'brasileirao-2026-updater/1.0' } })
  if (!response.ok) throw new Error(`ESPN summary ${eventId}: HTTP ${response.status}`)
  return parseMatchEvents(await response.text(), { eventId })
}

/**
 * Índice do scoreboard da temporada: par ordenado → eventos publicados.
 * Usado para casar um resultado já empacotado (que pode vir do Football-Data)
 * com o eventId da ESPN, sem depender do snapshot diário do ciclo.
 */
export function parseSeasonScoreboard(jsonText) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  const byPair = new Map()
  for (const event of payload?.events ?? []) {
    const competition = event?.competitions?.[0]
    if (!competition) continue
    const home = competition.competitors?.find((entry) => entry.homeAway === 'home')
    const away = competition.competitors?.find((entry) => entry.homeAway === 'away')
    if (!home || !away) continue
    const key = `${clubSlug(home.team?.displayName)}:${clubSlug(away.team?.displayName)}`
    const entry = {
      eventId: String(competition.id ?? event.id),
      date: competition.date ?? event.date ?? null,
      homeScore: Number(home.score),
      awayScore: Number(away.score),
      completed: competition.status?.type?.completed === true || event.status?.type?.state === 'post',
    }
    const list = byPair.get(key) ?? []
    list.push(entry)
    byPair.set(key, list)
  }
  return byPair
}

/** Objeto gravável do snapshot normalizado (procedência por partida). */
export function renderMatchSnapshot(parsed, { fetchedAt }) {
  return {
    source: 'ESPN',
    endpoint: 'site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary',
    eventId: parsed.eventId,
    fetchedAt,
    date: parsed.date,
    status: parsed.status,
    home: parsed.home,
    away: parsed.away,
    homeGoals: parsed.homeGoals,
    awayGoals: parsed.awayGoals,
    goals: parsed.goals,
    ownGoals: parsed.ownGoals,
    cards: parsed.cards,
    unresolved: parsed.unresolved,
  }
}

/**
 * Agrega snapshots normalizados por atleta. Mesmo nome em clubes diferentes
 * permanece em linhas separadas: a chave é (nome, clube).
 */
export function aggregatePlayerStats(matches) {
  const scorers = new Map()
  const discipline = new Map()
  let ownGoals = 0
  let unresolved = 0
  let goalsAttributed = 0
  let goalsInPackage = 0
  const mismatchedMatches = []

  for (const match of matches) {
    const matchGoals = (match.goals?.length ?? 0) + (match.ownGoals?.length ?? 0)
    goalsInPackage += Number(match.homeGoals ?? 0) + Number(match.awayGoals ?? 0)
    goalsAttributed += match.goals?.length ?? 0
    ownGoals += match.ownGoals?.length ?? 0
    unresolved += match.unresolved?.length ?? 0
    if (matchGoals !== Number(match.homeGoals ?? 0) + Number(match.awayGoals ?? 0)) {
      mismatchedMatches.push(match.eventId)
    }

    for (const goal of match.goals ?? []) {
      const key = `${goal.athlete}\u0000${goal.club}`
      const entry = scorers.get(key) ?? { player: goal.athlete, club: goal.club, goals: 0 }
      entry.goals += 1
      scorers.set(key, entry)
    }

    for (const card of match.cards ?? []) {
      const key = `${card.athlete}\u0000${card.club}`
      const entry = discipline.get(key) ?? { player: card.athlete, club: card.club, yellow: 0, red: 0 }
      if (card.type === 'red') entry.red += 1
      else entry.yellow += 1
      discipline.set(key, entry)
    }
  }

  const scorerRows = [...scorers.values()].sort(
    (left, right) => right.goals - left.goals || left.player.localeCompare(right.player, 'pt-BR'),
  )
  const disciplineRows = [...discipline.values()].sort(
    (left, right) =>
      right.yellow + right.red - (left.yellow + left.red) ||
      right.red - left.red ||
      left.player.localeCompare(right.player, 'pt-BR'),
  )

  return {
    scorers: scorerRows,
    discipline: disciplineRows,
    coverage: {
      matchesCovered: matches.length,
      goalsInPackage,
      goalsAttributed,
      ownGoals,
      unresolved,
      mismatchedMatches,
    },
  }
}

/**
 * Corroboração (log, nunca fonte do produto): cartões por partida do ESPN
 * contra o registro avançado da 365scores. Só compara o que existe nos dois
 * lados; ausência de partida no ESPN não vira zero.
 */
export function compareCardTotals(matches, advancedRecords) {
  const byPair = new Map((advancedRecords ?? []).map((record) => [`${record.home}:${record.away}`, record]))
  const rows = []
  for (const match of matches) {
    const record = byPair.get(`${match.home}:${match.away}`)
    if (!record) continue
    const espnYellowHome = match.cards.filter((card) => card.club === match.home && card.type === 'yellow').length
    const espnYellowAway = match.cards.filter((card) => card.club === match.away && card.type === 'yellow').length
    const espnRedHome = match.cards.filter((card) => card.club === match.home && card.type === 'red').length
    const espnRedAway = match.cards.filter((card) => card.club === match.away && card.type === 'red').length
    rows.push({
      eventId: match.eventId,
      pair: `${match.home}:${match.away}`,
      yellowDelta:
        Math.abs(espnYellowHome - record.yellowHome) +
        Math.abs(espnYellowAway - record.yellowAway) +
        Math.abs(espnRedHome - record.redHome) +
        Math.abs(espnRedAway - record.redAway),
    })
  }
  return {
    compared: rows.length,
    yellowDelta: rows.reduce((sum, row) => sum + row.yellowDelta, 0),
    rows,
  }
}

/** Módulo TS gerado (src/scorers2026.ts) a partir dos eventos da ESPN. */
export function renderScorersModule({ scorers, fetchedAt, sourceSha, coverage }) {
  const lines = scorers.map(
    (scorer) =>
      `  { name: '${scorer.player.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', club: '${scorer.club}', goals: ${scorer.goals} },`,
  )
  return `/**
 * Artilharia 2026 — GERADO por scripts/refresh-espn-scorers.mjs a partir dos
 * eventos de partida da ESPN (keyEvents do summary, um snapshot por partida
 * em data/source-snapshots/espn-events-<eventId>.json). NÃO EDITAR À MÃO.
 *
 * A ESPN não publica assistências nos eventos de partida: o campo está
 * ausente por indisponibilidade declarada, não por zero.
 *
 * fetchedAt é o instante da última captura de eventos; a cobertura por partida
 * é declarada em matchesCovered/goalsAttributed. Σgols de atletas ≈ gols pró
 * da tabela menos gols contra; gols contra e eventos sem atleta não viram
 * artilheiro e ficam contados em ownGoals/unresolved.
 */

export const SCORERS_SOURCE = {
  name: 'ESPN (eventos de partida)',
  fetchedAt: '${fetchedAt}',
  sha256: '${sourceSha}',
  assists: 'unavailable',
  matchesCovered: ${coverage.matchesCovered},
  goalsInPackage: ${coverage.goalsInPackage},
  goalsAttributed: ${coverage.goalsAttributed},
  ownGoals: ${coverage.ownGoals},
  unresolvedEvents: ${coverage.unresolved},
} as const

export interface Scorer2026 {
  name: string
  club: string
  goals: number
}

export const scorers2026: readonly Scorer2026[] = [
${lines.join('\n')}
]
`
}
