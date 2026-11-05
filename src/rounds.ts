import { cbfOfficialSchedule } from './cbfOfficialSchedule'
import { currentSeasonResults, type CurrentSeasonMatch } from './currentSeasonResults'
import { currentClubs, remainingFixtures } from './projectionData'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'

/**
 * Análises por rodada: o calendário CBF (380 tuplas) tem o par ordenado
 * (mandante, visitante) único, então cada resultado casa com exatamente uma
 * rodada. Nota do calendário: a rodada 33 tem 9 jogos e a 34 tem 11 (o ref
 * 330 está gravado como rodada 34 na tabela básica).
 */

export const FIRST_TURN_LAST_ROUND = 19
export const TOTAL_FIXTURES = 380

export interface RoundFixtureRef {
  ref: string
  round: number
  home: string
  away: string
}

export interface RoundResult extends CurrentSeasonMatch {
  round: number
  cbfRef: string
}

export interface StandingsRow {
  id: string
  club: string
  position: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export interface RoundStreak {
  id: string
  club: string
  wins: number
  draws: number
  losses: number
  unbeaten: number
  winless: number
}

const scheduleByPair = new Map(cbfOfficialSchedule.map(([ref, round, home, away]) => [`${home}:${away}`, { ref, round, home, away }]))

export function fixtureRefForPair(home: string, away: string): RoundFixtureRef | undefined {
  return scheduleByPair.get(`${home}:${away}`)
}

export function roundOfMatch(match: Pick<CurrentSeasonMatch, 'home' | 'away'>): number | undefined {
  return scheduleByPair.get(`${match.home}:${match.away}`)?.round
}

/** Resultados até o corte, cada um com sua rodada e referência CBF. */
export function resultsWithRound(matches: readonly CurrentSeasonMatch[] = currentSeasonResults): RoundResult[] {
  return filterAtOrBeforeAnalyticalCutoff(matches)
    .map((match): RoundResult => {
      const fixture = scheduleByPair.get(`${match.home}:${match.away}`)
      return { ...match, round: fixture?.round ?? -1, cbfRef: fixture?.ref ?? '—' }
    })
    .filter((match) => match.round > 0)
}

/** Rodadas com todos os jogos já disputados, em ordem crescente. */
export function completedRounds(matches: readonly CurrentSeasonMatch[] = currentSeasonResults): number[] {
  const pendingPairs = new Set(remainingFixtures.map(({ home, away }) => `${home}:${away}`))
  const counts = new Map<number, { played: number; scheduled: number }>()
  for (const [, round, home, away] of cbfOfficialSchedule) {
    const entry = counts.get(round) ?? { played: 0, scheduled: 0 }
    entry.scheduled += 1
    if (!pendingPairs.has(`${home}:${away}`)) entry.played += 1
    counts.set(round, entry)
  }
  void matches
  return [...counts.entries()]
    .filter(([, { played, scheduled }]) => played === scheduled)
    .map(([round]) => round)
    .sort((left, right) => left - right)
}

export interface StandingsFilter {
  /** Restringe aos resultados destas rodadas específicas (todas se ausente). */
  rounds?: readonly number[]
  /** Faixa inclusiva de rodadas (ex.: turno = 1–19). */
  fromRound?: number
  toRound?: number
  /** Restringe aos jogos como mandante/visitante do clube. */
  venue?: 'home' | 'away'
}

const emptyRow = (id: string, club: string): StandingsRow => ({
  id, club, position: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
})

export function compareStandingsRows(left: StandingsRow, right: StandingsRow): number {
  return right.points - left.points
    || right.wins - left.wins
    || right.goalDifference - left.goalDifference
    || right.goalsFor - left.goalsFor
    || left.club.localeCompare(right.club, 'pt-BR')
}

/**
 * Classificação agregada dos resultados até o corte, com filtros de rodada e
 * mando. Critérios de ordem: pontos → vitórias → saldo → gols pró (mesmos
 * quatro primeiros critérios da simulação; sem H2H/cartões aqui).
 */
export function standingsFromResults(filter: StandingsFilter = {}, matches: readonly CurrentSeasonMatch[] = currentSeasonResults): StandingsRow[] {
  const clubNames = new Map(currentClubs.map(({ id, club }) => [id, club]))
  const rows = new Map<string, StandingsRow>(currentClubs.map(({ id, club }) => [id, emptyRow(id, club)]))
  const allowedRounds = filter.rounds ? new Set(filter.rounds) : null

  for (const result of resultsWithRound(matches)) {
    if (allowedRounds && !allowedRounds.has(result.round)) continue
    if (filter.fromRound !== undefined && result.round < filter.fromRound) continue
    if (filter.toRound !== undefined && result.round > filter.toRound) continue
    const home = rows.get(result.home)
    const away = rows.get(result.away)
    if (!home || !away) continue
    if (filter.venue === 'home') {
      home.played += 1
      home.goalsFor += result.homeGoals
      home.goalsAgainst += result.awayGoals
      if (result.homeGoals > result.awayGoals) { home.wins += 1; home.points += 3 }
      else if (result.homeGoals === result.awayGoals) { home.draws += 1; home.points += 1 }
      else home.losses += 1
      continue
    }
    if (filter.venue === 'away') {
      away.played += 1
      away.goalsFor += result.awayGoals
      away.goalsAgainst += result.homeGoals
      if (result.awayGoals > result.homeGoals) { away.wins += 1; away.points += 3 }
      else if (result.awayGoals === result.homeGoals) { away.draws += 1; away.points += 1 }
      else away.losses += 1
      continue
    }
    home.played += 1
    away.played += 1
    home.goalsFor += result.homeGoals
    home.goalsAgainst += result.awayGoals
    away.goalsFor += result.awayGoals
    away.goalsAgainst += result.homeGoals
    if (result.homeGoals > result.awayGoals) { home.wins += 1; home.points += 3; away.losses += 1 }
    else if (result.homeGoals < result.awayGoals) { away.wins += 1; away.points += 3; home.losses += 1 }
    else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1 }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, club: clubNames.get(row.id) ?? row.id, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort(compareStandingsRows)
    .map((row, index) => ({ ...row, position: index + 1 }))
}

/** Números das N últimas rodadas com jogos disputados (a maioria tem 10 jogos). */
export function lastNRounds(n: number, matches: readonly CurrentSeasonMatch[] = currentSeasonResults): number[] {
  return completedRounds(matches).slice(-n)
}

/** Rodadas com pelo menos um jogo disputado (adiados podem deixá-las parciais), em ordem crescente. */
export function playedRounds(matches: readonly CurrentSeasonMatch[] = currentSeasonResults): number[] {
  return [...new Set(resultsWithRound(matches).map(({ round }) => round))].sort((left, right) => left - right)
}

export interface ClubRoundPosition {
  id: string
  club: string
  /** Posição após cada rodada com jogos (índice 0 = primeira rodada jogada). */
  positions: number[]
}

/**
 * Classificação cumulativa após cada rodada com jogos — inclui rodadas
 * parciais (adiados), então o último ponto coincide com a classificação
 * oficial no corte.
 */
export function positionByRound(matches: readonly CurrentSeasonMatch[] = currentSeasonResults): { rounds: number[]; clubs: ClubRoundPosition[] } {
  const rounds = playedRounds(matches)
  const clubNames = new Map(currentClubs.map(({ id, club }) => [id, club]))
  const history = rounds.map((round) => standingsFromResults({ toRound: round }, matches))
  return {
    rounds,
    clubs: currentClubs.map(({ id }) => ({
      id,
      club: clubNames.get(id) ?? id,
      positions: history.map((table) => table.find((row) => row.id === id)?.position ?? currentClubs.length),
    })),
  }
}

/** Sequências vigentes por clube, na ordem cronológica dos resultados. */
export function currentStreaks(matches: readonly CurrentSeasonMatch[] = currentSeasonResults): RoundStreak[] {
  const clubNames = new Map(currentClubs.map(({ id, club }) => [id, club]))
  const results = resultsWithRound(matches)
    .slice()
    .sort((left, right) => left.kickoff.localeCompare(right.kickoff) || left.cbfRef.localeCompare(right.cbfRef))

  const streaks = new Map<string, RoundStreak>(currentClubs.map(({ id }) => [id, { id, club: '', wins: 0, draws: 0, losses: 0, unbeaten: 0, winless: 0 }]))
  for (const result of results) {
    for (const [id, isHome] of [[result.home, true], [result.away, false]] as const) {
      const streak = streaks.get(id)
      if (!streak) continue
      const own = isHome ? result.homeGoals : result.awayGoals
      const other = isHome ? result.awayGoals : result.homeGoals
      if (own > other) { streak.wins += 1; streak.draws = 0; streak.losses = 0; streak.unbeaten += 1; streak.winless = 0 }
      else if (own === other) { streak.draws += 1; streak.wins = 0; streak.losses = 0; streak.unbeaten += 1; streak.winless += 1 }
      else { streak.losses += 1; streak.wins = 0; streak.draws = 0; streak.unbeaten = 0; streak.winless += 1 }
    }
  }
  return [...streaks.values()].map((streak) => ({ ...streak, club: clubNames.get(streak.id) ?? streak.id }))
}

export interface ExtremesRow {
  id: string
  club: string
  goalsPerMatch: number
  concededPerMatch: number
}

/** Melhor ataque (gols marcados/jogo) e melhor defesa (sofridos/jogo) entre os jogos disputados. */
export function attackDefenseLeaders(matches: readonly CurrentSeasonMatch[] = currentSeasonResults): { attack: ExtremesRow; defense: ExtremesRow } {
  const withRates = standingsFromResults({}, matches).map((row) => ({
    id: row.id,
    club: row.club,
    goalsPerMatch: row.played === 0 ? 0 : row.goalsFor / row.played,
    concededPerMatch: row.played === 0 ? Number.POSITIVE_INFINITY : row.goalsAgainst / row.played,
  }))
  const attack = withRates.reduce((best, row) => (row.goalsPerMatch > best.goalsPerMatch ? row : best), withRates[0]!)
  const defense = withRates.reduce((best, row) => (row.concededPerMatch < best.concededPerMatch ? row : best), withRates[0]!)
  return { attack, defense }
}
