/**
 * Pipeline de atualização pós-rodada (funções puras, sem rede).
 *
 * Fontes: Football-Data (CSV, Date DD/MM/YYYY + Time HH:MM SEM fuso) e ESPN
 * (scoreboard diário, kickoffs UTC com Z). O par ordenado (mandante,
 * visitante) é único no calendário CBF de 380 jogos e serve de join.
 *
 * Política de corte (conservadora, herdada do empacotamento manual):
 * - Football-Data: inclui apenas partidas com data estritamente anterior ao
 *   dia corrente da coleta (o dia-limite inteiro fica fora — fuso desconhecido).
 * - ESPN: inclui partidas com kickoff ≤ instante da coleta (fuso explícito).
 */

import { readFileSync } from 'node:fs'

const TEAM_SLUGS = {
  'Athletico-PR': 'athletico-pr',
  'Atletico-MG': 'atletico-mg',
  'Bahia': 'bahia',
  'Botafogo RJ': 'botafogo',
  'Bragantino': 'bragantino',
  'Chapecoense-SC': 'chapecoense',
  'Corinthians': 'corinthians',
  'Coritiba': 'coritiba',
  'Cruzeiro': 'cruzeiro',
  'Flamengo RJ': 'flamengo',
  'Fluminense': 'fluminense',
  'Gremio': 'gremio',
  'Internacional': 'internacional',
  'Mirassol': 'mirassol',
  'Palmeiras': 'palmeiras',
  'Remo': 'remo',
  'Santos': 'santos',
  'Sao Paulo': 'sao-paulo',
  'Vasco': 'vasco',
  'Vitoria': 'vitoria',
}

/** Extrai as 380 tuplas do calendário direto do fonte TS (fonte única). */
export function parseCbfSchedule(source) {
  const tuplePattern = /\['(\d{3})', (\d+), '([a-z-]+)', '([a-z-]+)'\]/g
  const schedule = []
  for (const [, ref, round, home, away] of source.matchAll(tuplePattern)) {
    schedule.push({ ref, round: Number(round), home, away })
  }
  if (schedule.length !== 380) throw new Error(`Calendário inesperado: ${schedule.length} tuplas (esperado 380).`)
  return schedule
}

function csvSlug(name) {
  const slug = TEAM_SLUGS[name]
  if (!slug) throw new Error(`Nome de clube sem slug conhecido: "${name}". Atualize TEAM_SLUGS.`)
  return slug
}

function isoDateFromBrFormat(date) {
  const [day, month, year] = date.split('/')
  return `${year}-${month}-${day}`
}

/**
 * Linhas da temporada alvo do CSV Football-Data com placar completo.
 * `csvLine` é 1-based contando o cabeçalho — mesma convenção do empacotamento
 * manual (sourceRef `csv-line-N`).
 */
export function parseFootballDataCsv(csvText, { seasonYear, cutoffDate }) {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const matches = []
  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(',')
    if (columns.length < 10 || columns[0] !== 'Brazil' || columns[1] !== 'Serie A') continue
    if (columns[2] !== String(seasonYear)) continue
    const homeGoals = columns[7]
    const awayGoals = columns[8]
    if (homeGoals === '' || awayGoals === '') continue
    const date = isoDateFromBrFormat(columns[3])
    // Corte conservador: o dia-limite inteiro fica de fora (fuso não informado).
    if (date >= cutoffDate) continue
    const time = columns[4] || '00:00'
    matches.push({
      home: csvSlug(columns[5]),
      away: csvSlug(columns[6]),
      homeGoals: Number(homeGoals),
      awayGoals: Number(awayGoals),
      kickoff: `${date}T${time}`,
      source: 'football-data',
      sourceRef: `csv-line-${index + 1}`,
    })
  }
  return matches
}

/** Resultados concluídos do(s) scoreboard(s) ESPN com kickoff ≤ corte. */
export function parseEspnScoreboard(jsonText, { cutoffUtc }) {
  const payload = JSON.parse(jsonText)
  const events = payload.events ?? []
  const matches = []
  for (const event of events) {
    const status = event.status?.type?.state
    if (status !== 'post') continue
    const competitions = event.competitions ?? []
    const competition = competitions[0]
    if (!competition) continue
    const home = competition.competitors?.find((entry) => entry.homeAway === 'home')
    const away = competition.competitors?.find((entry) => entry.homeAway === 'away')
    if (!home || !away) continue
    const kickoff = event.date
    if (kickoff > cutoffUtc) continue
    const slugOf = (team) => {
      const slug = TEAM_SLUGS[team.displayName ?? team.name]
      if (!slug) throw new Error(`Nome ESPN sem slug conhecido: "${team.displayName ?? team.name}". Atualize TEAM_SLUGS.`)
      return slug
    }
    matches.push({
      home: slugOf(home.team),
      away: slugOf(away.team),
      homeGoals: Number(home.score),
      awayGoals: Number(away.score),
      kickoff,
      source: 'espn',
      sourceRef: String(event.id),
    })
  }
  return matches
}

/**
 * Fusão dos resultados novos com os existentes:
 * - cada par deve existir no calendário (par ordenado único);
 * - par já presente é ignorado (precedência do empacotamento anterior);
 * - devolve também os novos efetivamente incorporados.
 */
export function mergeResults({ schedule, existing, incoming }) {
  const byPair = new Map(schedule.map(({ home, away }) => [`${home}:${away}`, { home, away }]))
  const existingPairs = new Set(existing.map((match) => `${match.home}:${match.away}`))
  const merged = [...existing]
  const added = []
  const rejected = []
  for (const match of incoming) {
    if (!byPair.has(`${match.home}:${match.away}`)) {
      rejected.push({ match, reason: 'par fora do calendário CBF 2026' })
      continue
    }
    if (existingPairs.has(`${match.home}:${match.away}`)) continue
    existingPairs.add(`${match.home}:${match.away}`)
    merged.push(match)
    added.push(match)
  }
  return { merged, added, rejected }
}

/** Agregado por clube na ordem de classificação (pontos → vitórias → saldo → gols pró). */
export function computeStandings(results, schedule) {
  const slugs = new Set(schedule.flatMap(({ home, away }) => [home, away]))
  const rows = new Map([...slugs].map((slug) => [slug, { id: slug, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]))
  for (const match of results) {
    const home = rows.get(match.home)
    const away = rows.get(match.away)
    if (!home || !away) throw new Error(`Resultado com clube fora do calendário: ${match.home}–${match.away}`)
    home.played += 1
    away.played += 1
    home.goalsFor += match.homeGoals
    home.goalsAgainst += match.awayGoals
    away.goalsFor += match.awayGoals
    away.goalsAgainst += match.homeGoals
    if (match.homeGoals > match.awayGoals) { home.wins += 1; home.points += 3; away.losses += 1 }
    else if (match.homeGoals < match.awayGoals) { away.wins += 1; away.points += 3; home.losses += 1 }
    else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1 }
  }
  return [...rows.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((left, right) => right.points - left.points || right.wins - left.wins || right.goalDifference - left.goalDifference || right.goalsFor - left.goalsFor || left.id.localeCompare(right.id))
    .map((row, index) => ({ ...row, position: index + 1 }))
}

/** Pendentes do calendário com rótulo de rodada (sufixo `adiado` em furos antigos). */
export function computeRemaining(results, schedule) {
  const playedPairs = new Set(results.map((match) => `${match.home}:${match.away}`))
  const byRound = new Map()
  for (const fixture of schedule) {
    const list = byRound.get(fixture.round) ?? []
    list.push(fixture)
    byRound.set(fixture.round, list)
  }
  // Rodada completa = todos os 10 (9/11) jogos com resultado
  const completeRounds = [...byRound.entries()]
    .filter(([, fixtures]) => fixtures.every((fixture) => playedPairs.has(`${fixture.home}:${fixture.away}`)))
    .map(([round]) => round)
  const maxComplete = completeRounds.length > 0 ? Math.max(...completeRounds) : 0

  return schedule
    .filter((fixture) => !playedPairs.has(`${fixture.home}:${fixture.away}`))
    .map((fixture) => ({
      round: fixture.round <= maxComplete ? `${fixture.round} adiado` : String(fixture.round),
      home: fixture.home,
      away: fixture.away,
      cbfRef: fixture.ref,
    }))
}

/** Validações de integridade: nada é publicado se alguma falhar. */
export function validateIntegrity({ schedule, results, remaining }) {
  const errors = []
  const schedulePairs = new Map(schedule.map(({ home, away }) => [`${home}:${away}`, true]))
  const resultPairs = results.map((match) => `${match.home}:${match.away}`)
  if (new Set(resultPairs).size !== resultPairs.length) errors.push('resultado duplicado por par ordenado')
  for (const pair of resultPairs) {
    if (!schedulePairs.has(pair)) errors.push(`resultado fora do calendário: ${pair}`)
  }
  if (results.length + remaining.length !== schedule.length) {
    errors.push(`disputa + pendentes = ${results.length + remaining.length} ≠ ${schedule.length}`)
  }
  const remainingPairs = remaining.map(({ home, away }) => `${home}:${away}`)
  if (new Set(remainingPairs).size !== remainingPairs.length) errors.push('pendente duplicado por par ordenado')
  if (errors.length > 0) throw new Error(`Integridade falhou:\n- ${errors.join('\n- ')}`)
  return true
}

/** Lê o corte atual empacotado (para o updater saber de onde coletar). */
export function readCurrentCutoff(source) {
  const utc = source.match(/ANALYTICAL_CUTOFF_UTC = '([^']+)'/)?.[1]
  if (!utc) throw new Error('ANALYTICAL_CUTOFF_UTC não encontrado em sourceMetadata.ts.')
  return utc
}

/** Serializa os módulos TS regenerados (ordem determinística). */
export function renderCurrentSeasonResults({ results, metadata }) {
  const lines = results.map((match) =>
    `  { home: "${match.home}", away: "${match.away}", homeGoals: ${match.homeGoals}, awayGoals: ${match.awayGoals}, kickoff: "${match.kickoff}", source: "${match.source}", sourceRef: "${match.sourceRef}" },`)
  return `// Empacotado automaticamente por scripts/update-data.mjs em ${metadata.generatedAt}.
// Fontes e hashes em CURRENT_SEASON_SOURCE; cópias brutas em data/source-snapshots/.
// Football-Data: ${metadata.rows2026} linhas 2026 no CSV da coleta (sha256 ${metadata.sha256}).
// ESPN: ${metadata.espnCount} placares complementares com kickoff anterior ao corte.
export type CurrentSeasonMatch = {
  home: string
  away: string
  homeGoals: number
  awayGoals: number
  kickoff: string
  source: 'football-data' | 'espn'
  sourceRef: string
}

export const CURRENT_SEASON_SOURCE = {
  footballData: {
    url: 'https://www.football-data.co.uk/new/BR.csv',
    collectedAt: '${metadata.collectedAt}',
    timezone: 'not specified by the source; original date/time preserved',
    sha256: '${metadata.sha256}',
    file: 'data/source-snapshots/football-data-BR.csv',
    rows2026: ${metadata.rows2026},
  },
  espn: {
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard',
    collectedAt: '${metadata.collectedAt}',
    timezone: 'UTC (kickoff timestamps include Z)',
    file: 'data/source-snapshots/',
    completedMatches: ${metadata.espnCount},
  },
  cbfStandings: {
    url: 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026',
    collectedAt: '${metadata.collectedAt}',
    displayedTimestamp: '${metadata.cbfDisplayed}',
    displayedTimestampTimezone: 'not specified',
    sha256: '${metadata.cbfSha256 ?? metadata.lastCbfSha256}',
    file: 'data/source-snapshots/cbf-table-2026.html',
    validation: 'aggregate standings only; snapshot reconciled with packed results',
  },
} as const

export const currentSeasonResults: CurrentSeasonMatch[] = [
${lines.join('\n')}
]
`
}

export function renderProjectionData({ standings, remaining, displayNameFor }) {
  const clubLines = standings.map((row) => {
    const initials = displayNameFor[row.id]?.initials ?? row.id.slice(0, 3).toUpperCase()
    const name = displayNameFor[row.id]?.club ?? row.id
    return `  { id: '${row.id}', club: '${name}', initials: '${initials}', position: ${row.position}, points: ${row.points}, played: ${row.played}, wins: ${row.wins}, draws: ${row.draws}, losses: ${row.losses}, goalsFor: ${row.goalsFor}, goalsAgainst: ${row.goalsAgainst} },`
  })
  const fixtureLines = remaining.map((fixture) =>
    `  { round: '${fixture.round}', home: '${fixture.home}', away: '${fixture.away}', cbfRef: '${fixture.cbfRef}' },`)
  return `// Empacotado automaticamente por scripts/update-data.mjs; agregado reconciliado com os resultados.
export interface ProjectionClub {
  id: string
  club: string
  initials: string
  position: number
  points: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

export interface RemainingFixture {
  round: string
  home: string
  away: string
  cbfRef: string
}

export const currentClubs: ProjectionClub[] = [
${clubLines.join('\n')}
]

export const remainingFixtures: RemainingFixture[] = [
${fixtureLines.join('\n')}
]

export { historicalSeasons } from './historicalSeasons'
`
}

export function renderSourceMetadata({ cutoffLocal, cutoffUtc }) {
  return `// Corte analítico regenerado por scripts/update-data.mjs: fim dos jogos da última rodada coletada.
// Football-Data não informa fuso; o dia-limite inteiro permanece de fora (política conservadora).
export const ANALYTICAL_CUTOFF_LOCAL = '${cutoffLocal}'
export const ANALYTICAL_CUTOFF_UTC = '${cutoffUtc}'

export interface CutoffDatedMatch {
  kickoff: string
  source: 'football-data' | 'espn'
}

/**
 * Regras do corte por fonte: Football-Data é comparado pela data (string) por
 * não informar fuso — o dia-limite inteiro é excluído por conservadorismo;
 * ESPN exige sufixo de fuso explícito e usa o instante exato do kickoff.
 */
export function isAtOrBeforeAnalyticalCutoff(kickoff: string, source: CutoffDatedMatch['source']): boolean {
  if (source === 'espn') {
    if (!/(?:Z|[+-]\\d{2}:\\d{2})$/i.test(kickoff)) return false
    return Date.parse(kickoff) <= Date.parse(ANALYTICAL_CUTOFF_UTC)
  }
  const cutoffDate = ANALYTICAL_CUTOFF_UTC.slice(0, 10)
  return kickoff.slice(0, 10) < cutoffDate
}

/** Corte em bloco: registros com kickoff idêntico entram ou saem juntos. */
export function filterAtOrBeforeAnalyticalCutoff<T extends CutoffDatedMatch>(matches: readonly T[]): T[] {
  const decisions = new Map<string, boolean>()
  for (const match of matches) {
    if (!decisions.has(match.kickoff)) decisions.set(match.kickoff, isAtOrBeforeAnalyticalCutoff(match.kickoff, match.source))
  }
  return matches.filter((match) => decisions.get(match.kickoff)!)
}
`
}

/** Carrega o calendário do fonte TS (o updater roda fora do Vite/TS). */
export function loadCbfSchedule(srcRoot) {
  const source = readFileSync(`${srcRoot}/cbfOfficialSchedule.ts`, 'utf8')
  return parseCbfSchedule(source)
}
