import type { ExpectedGoals } from './projection'

export interface ModelMatch {
  home: string
  away: string
  homeGoals: number
  awayGoals: number
  kickoff: string
  seasonYear: number
  sourceOrdinal: number
}

export interface ModelTotals {
  played: number
  goalsFor: number
  goalsAgainst: number
}

export interface GoalAverages {
  home: number
  away: number
}

export interface HeadToHeadAdjustment {
  home: number
  away: number
  effectiveWeight: number
}

export type ForecastVariant = 'baseline' | 'home-away' | 'h2h' | 'combined'

export const MODEL_PARAMETERS = {
  baselineShrinkageMatches: 20,
  homeAwayShrinkageCandidates: [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30],
  homeAwayHistoricalPriorMatches: 20,
  h2hShrinkageMatches: 6,
  h2hHalfLifeYears: 2.5,
  h2hMaximumGoalAdjustment: 0.35,
} as const

export function historicalGoalAverages(matches: readonly Pick<ModelMatch, 'homeGoals' | 'awayGoals'>[]): GoalAverages {
  if (matches.length === 0) return { home: 1, away: 1 }
  const total = matches.reduce((sum, match) => ({
    home: sum.home + match.homeGoals,
    away: sum.away + match.awayGoals,
  }), { home: 0, away: 0 })
  return { home: total.home / matches.length, away: total.away / matches.length }
}

function emptyTotals(): ModelTotals {
  return { played: 0, goalsFor: 0, goalsAgainst: 0 }
}

function addTotals(totals: ModelTotals, goalsFor: number, goalsAgainst: number): void {
  totals.played += 1
  totals.goalsFor += goalsFor
  totals.goalsAgainst += goalsAgainst
}

export function aggregateTeamTotals(matches: readonly ModelMatch[]): Map<string, ModelTotals> {
  const totals = new Map<string, ModelTotals>()
  for (const match of matches) {
    const home = totals.get(match.home) ?? emptyTotals()
    const away = totals.get(match.away) ?? emptyTotals()
    addTotals(home, match.homeGoals, match.awayGoals)
    addTotals(away, match.awayGoals, match.homeGoals)
    totals.set(match.home, home)
    totals.set(match.away, away)
  }
  return totals
}

export function expectedGoalsFromTeamTotals(
  home: ModelTotals,
  away: ModelTotals,
  averages: GoalAverages,
  shrinkageMatches: number,
): ExpectedGoals {
  const averageTeamGoals = (averages.home + averages.away) / 2
  if (averageTeamGoals <= 0) return { home: averages.home, away: averages.away }
  // Sem partidas e sem encolhimento não há informação de força: multiplicadores
  // neutros (1) evitam NaN na divisão por zero (auditoria: divisões sem guarda).
  const strength = (team: ModelTotals): { attack: number; defense: number } => {
    const matches = team.played + shrinkageMatches
    if (matches === 0) return { attack: 1, defense: 1 }
    return {
      attack: (team.goalsFor + shrinkageMatches * averageTeamGoals) / matches / averageTeamGoals,
      defense: (team.goalsAgainst + shrinkageMatches * averageTeamGoals) / matches / averageTeamGoals,
    }
  }
  const homeStrength = strength(home)
  const awayStrength = strength(away)
  return {
    home: averages.home * homeStrength.attack * awayStrength.defense,
    away: averages.away * awayStrength.attack * homeStrength.defense,
  }
}

function homeAwayTotals(matches: readonly ModelMatch[]): Map<string, { home: ModelTotals; away: ModelTotals }> {
  const totals = new Map<string, { home: ModelTotals; away: ModelTotals }>()
  for (const match of matches) {
    const home = totals.get(match.home) ?? { home: emptyTotals(), away: emptyTotals() }
    const away = totals.get(match.away) ?? { home: emptyTotals(), away: emptyTotals() }
    addTotals(home.home, match.homeGoals, match.awayGoals)
    addTotals(away.away, match.awayGoals, match.homeGoals)
    totals.set(match.home, home)
    totals.set(match.away, away)
  }
  return totals
}

type Venue = 'home' | 'away'
type Rate = 'attack' | 'defense'

function historicalPriorRate(
  clubId: string,
  venue: Venue,
  rate: Rate,
  matches: readonly ModelMatch[],
  referenceYear: number,
  leagueAverage: number,
): number {
  let weightedGames = 0
  let weightedGoals = 0
  for (const match of matches) {
    const isVenueMatch = venue === 'home' ? match.home === clubId : match.away === clubId
    if (!isVenueMatch || match.seasonYear >= referenceYear) continue
    const age = Math.max(0, referenceYear - match.seasonYear)
    const weight = 0.5 ** (age / MODEL_PARAMETERS.h2hHalfLifeYears)
    const goals = rate === 'attack'
      ? (venue === 'home' ? match.homeGoals : match.awayGoals)
      : (venue === 'home' ? match.awayGoals : match.homeGoals)
    weightedGames += weight
    weightedGoals += weight * goals
  }
  if (weightedGames === 0) return leagueAverage
  const reliability = weightedGames / (weightedGames + MODEL_PARAMETERS.homeAwayHistoricalPriorMatches)
  return reliability * (weightedGoals / weightedGames) + (1 - reliability) * leagueAverage
}

function rateForTeam(
  clubId: string,
  venue: Venue,
  rate: Rate,
  trainingMatches: readonly ModelMatch[],
  referenceYear: number,
  shrinkageMatches: number,
  leagueAverage: number,
): number {
  const seasonMatches = trainingMatches.filter((match) => match.seasonYear === referenceYear)
  const inSeasonTotals = homeAwayTotals(seasonMatches).get(clubId)?.[venue] ?? emptyTotals()
  const historicalRate = historicalPriorRate(clubId, venue, rate, trainingMatches, referenceYear, leagueAverage)
  const currentGoals = rate === 'attack' ? inSeasonTotals.goalsFor : inSeasonTotals.goalsAgainst
  return (currentGoals + shrinkageMatches * historicalRate) / (inSeasonTotals.played + shrinkageMatches)
}

export function expectedGoalsHomeAway(
  homeId: string,
  awayId: string,
  trainingMatches: readonly ModelMatch[],
  referenceYear: number,
  shrinkageMatches: number,
): ExpectedGoals {
  const averages = historicalGoalAverages(trainingMatches)
  const homeAttack = rateForTeam(homeId, 'home', 'attack', trainingMatches, referenceYear, shrinkageMatches, averages.home)
  const homeDefense = rateForTeam(homeId, 'home', 'defense', trainingMatches, referenceYear, shrinkageMatches, averages.away)
  const awayAttack = rateForTeam(awayId, 'away', 'attack', trainingMatches, referenceYear, shrinkageMatches, averages.away)
  const awayDefense = rateForTeam(awayId, 'away', 'defense', trainingMatches, referenceYear, shrinkageMatches, averages.home)
  return {
    home: Math.max(0.05, averages.home * (homeAttack / averages.home) * (awayDefense / averages.home)),
    away: Math.max(0.05, averages.away * (awayAttack / averages.away) * (homeDefense / averages.away)),
  }
}

export function estimateHeadToHeadAdjustment(
  records: readonly ModelMatch[],
  baseline: ExpectedGoals,
  referenceYear: number,
): HeadToHeadAdjustment {
  let weightSum = 0
  let homeResidual = 0
  let awayResidual = 0
  for (const match of records) {
    const age = Math.max(0, referenceYear - match.seasonYear)
    const weight = 0.5 ** (age / MODEL_PARAMETERS.h2hHalfLifeYears)
    weightSum += weight
    homeResidual += weight * (match.homeGoals - baseline.home)
    awayResidual += weight * (match.awayGoals - baseline.away)
  }
  const shrinkage = weightSum + MODEL_PARAMETERS.h2hShrinkageMatches
  const limit = MODEL_PARAMETERS.h2hMaximumGoalAdjustment
  return {
    home: Math.max(-limit, Math.min(limit, homeResidual / shrinkage)),
    away: Math.max(-limit, Math.min(limit, awayResidual / shrinkage)),
    effectiveWeight: weightSum,
  }
}

export function expectedGoalsForVariant(
  homeId: string,
  awayId: string,
  trainingMatches: readonly ModelMatch[],
  referenceYear: number,
  variant: ForecastVariant,
  shrinkageMatches: number,
): ExpectedGoals {
  const usesHeadToHead = variant === 'h2h' || variant === 'combined'
  const baseVariant = variant === 'home-away' || variant === 'combined' ? 'home-away' : 'baseline'
  const pairMatches = usesHeadToHead
    ? trainingMatches.filter((match) => (match.home === homeId && match.away === awayId)
      || (match.home === awayId && match.away === homeId))
    : []
  const strengthMatches = usesHeadToHead
    ? trainingMatches.filter((match) => !((match.home === homeId && match.away === awayId)
      || (match.home === awayId && match.away === homeId)))
    : trainingMatches

  let expected: ExpectedGoals
  if (baseVariant === 'home-away') {
    expected = expectedGoalsHomeAway(homeId, awayId, strengthMatches, referenceYear, shrinkageMatches)
  } else {
    const totals = aggregateTeamTotals(strengthMatches)
    const home = totals.get(homeId)
    const away = totals.get(awayId)
    if (!home || !away) throw new Error(`Clube ainda sem partidas no corte: ${homeId}–${awayId}`)
    expected = expectedGoalsFromTeamTotals(home, away, historicalGoalAverages(strengthMatches), shrinkageMatches)
  }

  if (!usesHeadToHead) return expected
  const sameMandoRecords = pairMatches.filter((match) => match.home === homeId && match.away === awayId)
  const adjustment = estimateHeadToHeadAdjustment(sameMandoRecords, expected, referenceYear)
  return {
    home: Math.max(0.05, expected.home + adjustment.home),
    away: Math.max(0.05, expected.away + adjustment.away),
  }
}

export function poissonResultProbabilities(expected: ExpectedGoals): [number, number, number] {
  const probabilities = (mean: number): number[] => {
    const values = [Math.exp(-mean)]
    for (let goals = 0; goals < 12; goals += 1) values.push(values[goals]! * mean / (goals + 1))
    const total = values.reduce((sum, value) => sum + value, 0)
    return values.map((value) => value / total)
  }
  const home = probabilities(expected.home)
  const away = probabilities(expected.away)
  const result: [number, number, number] = [0, 0, 0]
  for (let homeGoals = 0; homeGoals < home.length; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals < away.length; awayGoals += 1) {
      const index = homeGoals > awayGoals ? 0 : homeGoals === awayGoals ? 1 : 2
      result[index] += home[homeGoals]! * away[awayGoals]!
    }
  }
  const total = result.reduce((sum, value) => sum + value, 0)
  return result.map((value) => value / total) as [number, number, number]
}
