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

export interface ExpectedGoalsBreakdown {
  expected: ExpectedGoals
  /** Médias por mando da base de treino (μ casa/μ fora). */
  averages: GoalAverages
  homeAttackRate: number
  homeDefenseRate: number
  awayAttackRate: number
  awayDefenseRate: number
}

/**
 * Decomposição passo a passo do λ casa/fora com os mesmos fatores de
 * `expectedGoalsHomeAway` — usada na rastreabilidade do exemplo numérico
 * (aba Metodologia & Validação).
 */
export function expectedGoalsBreakdown(
  homeId: string,
  awayId: string,
  trainingMatches: readonly ModelMatch[],
  referenceYear: number,
  shrinkageMatches: number,
): ExpectedGoalsBreakdown {
  const averages = historicalGoalAverages(trainingMatches)
  const homeAttackRate = rateForTeam(homeId, 'home', 'attack', trainingMatches, referenceYear, shrinkageMatches, averages.home)
  const homeDefenseRate = rateForTeam(homeId, 'home', 'defense', trainingMatches, referenceYear, shrinkageMatches, averages.away)
  const awayAttackRate = rateForTeam(awayId, 'away', 'attack', trainingMatches, referenceYear, shrinkageMatches, averages.away)
  const awayDefenseRate = rateForTeam(awayId, 'away', 'defense', trainingMatches, referenceYear, shrinkageMatches, averages.home)
  return {
    expected: expectedGoalsHomeAway(homeId, awayId, trainingMatches, referenceYear, shrinkageMatches),
    averages,
    homeAttackRate,
    homeDefenseRate,
    awayAttackRate,
    awayDefenseRate,
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

export interface TeamStrengthRow {
  clubId: string
  /** Taxa de gols marcados como mandante (regularizada), em gols/jogo. */
  attackHome: number
  /** Taxa de gols sofridos como mandante. */
  defenseHome: number
  /** Taxa de gols marcados como visitante. */
  attackAway: number
  /** Taxa de gols sofridos como visitante. */
  defenseAway: number
}

/**
 * Tabela de forças por clube e mando usada pelo modelo casa/fora: a mesma
 * `rateForTeam` da previsão de produção, exposta para rastreabilidade
 * (aba Metodologia & Validação). μ de referência = médias por mando da base.
 */
export function teamStrengthTable(
  trainingMatches: readonly ModelMatch[],
  referenceYear: number,
  shrinkageMatches: number,
  clubIds: readonly string[],
  leagueAverages: GoalAverages,
): TeamStrengthRow[] {
  return clubIds.map((clubId) => ({
    clubId,
    attackHome: rateForTeam(clubId, 'home', 'attack', trainingMatches, referenceYear, shrinkageMatches, leagueAverages.home),
    defenseHome: rateForTeam(clubId, 'home', 'defense', trainingMatches, referenceYear, shrinkageMatches, leagueAverages.away),
    attackAway: rateForTeam(clubId, 'away', 'attack', trainingMatches, referenceYear, shrinkageMatches, leagueAverages.away),
    defenseAway: rateForTeam(clubId, 'away', 'defense', trainingMatches, referenceYear, shrinkageMatches, leagueAverages.home),
  }))
}

const MAX_GOALS = 12

/** Fator τ de Dixon-Coles para os quatro placares baixos; 1 nos demais. */
function tauFactor(homeGoals: number, awayGoals: number, rho: number, homeMean: number, awayMean: number): number {
  if (rho === 0) return 1
  if (homeGoals === 0 && awayGoals === 0) return 1 - homeMean * awayMean * rho
  if (homeGoals === 0 && awayGoals === 1) return 1 + homeMean * rho
  if (homeGoals === 1 && awayGoals === 0) return 1 + awayMean * rho
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho
  return 1
}

/** Grelha conjunta 13×13 de placares com ajuste DC, como cumulativa normalizada. */
export function dcJointGrid(expected: ExpectedGoals, rho = 0): { cumulative: number[]; size: number } {
  const pmf = (mean: number): number[] => {
    const values = [Math.exp(-mean)]
    for (let goals = 0; goals < MAX_GOALS; goals += 1) values.push(values[goals]! * mean / (goals + 1))
    const total = values.reduce((sum, value) => sum + value, 0)
    return values.map((value) => value / total)
  }
  const home = pmf(expected.home)
  const away = pmf(expected.away)
  const size = MAX_GOALS + 1
  const cumulative: number[] = []
  let accumulated = 0
  for (let h = 0; h < size; h += 1) {
    for (let a = 0; a < size; a += 1) {
      accumulated += home[h]! * away[a]! * tauFactor(h, a, rho, expected.home, expected.away)
      cumulative.push(accumulated)
    }
  }
  const total = accumulated
  return { cumulative: cumulative.map((value) => value / total), size }
}

/** Amostra (mandante, visitante) de uma grelha DC via uniforme em [0,1). */
export function sampleFromGrid(grid: { cumulative: readonly number[]; size: number }, uniform: number): { homeGoals: number; awayGoals: number } {
  const target = uniform * grid.cumulative[grid.cumulative.length - 1]!
  let low = 0
  let high = grid.cumulative.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (grid.cumulative[mid]! < target) low = mid + 1
    else high = mid
  }
  return { homeGoals: Math.floor(low / grid.size), awayGoals: low % grid.size }
}

/** Marginais H/E/F com ajuste DC nos placares baixos (rho = 0 → Poisson independente). */
export function poissonResultProbabilities(expected: ExpectedGoals, rho = 0): [number, number, number] {
  const grid = dcJointGrid(expected, rho)
  const result: [number, number, number] = [0, 0, 0]
  for (let cell = 0; cell < grid.cumulative.length; cell += 1) {
    const previous = cell > 0 ? grid.cumulative[cell - 1]! : 0
    const mass = grid.cumulative[cell]! - previous
    const homeGoals = Math.floor(cell / grid.size)
    const awayGoals = cell % grid.size
    const index = homeGoals > awayGoals ? 0 : homeGoals === awayGoals ? 1 : 2
    result[index] += mass
  }
  return result
}

/**
 * ρ de Dixon-Coles estimado por máxima verossimilhança sobre a base de
 * treino: λ/μ de cada partida vêm das forças casa/fora (mesma fórmula da
 * produção) e ρ entra apenas nos quatro placares baixos via τ.
 * Busca em grade [-0,15, 0,10]; devolve 0 para bases pequenas.
 */
export function estimateDixonColesRho(
  trainingMatches: readonly ModelMatch[],
  referenceYear: number,
  shrinkageMatches: number,
): number {
  if (trainingMatches.length < 40) return 0
  const averages = historicalGoalAverages(trainingMatches)
  const slugs = [...new Set(trainingMatches.flatMap(({ home, away }) => [home, away]))]
  const table = teamStrengthTable(trainingMatches, referenceYear, shrinkageMatches, slugs, averages)
  const strengthById = new Map(table.map((row) => [row.clubId, row]))

  const pmf = (mean: number): number[] => {
    const values = [Math.exp(-mean)]
    for (let goals = 0; goals < MAX_GOALS; goals += 1) values.push(values[goals]! * mean / (goals + 1))
    const total = values.reduce((sum, value) => sum + value, 0)
    return values.map((value) => value / total)
  }

  // Pré-computa por partida o que é constante em ρ.
  const prepared: { ph: number[]; pa: number[]; rest: number; homeMean: number; awayMean: number; observedHome: number; observedAway: number }[] = []
  for (const match of trainingMatches) {
    const homeStrength = strengthById.get(match.home)
    const awayStrength = strengthById.get(match.away)
    if (!homeStrength || !awayStrength) continue
    const homeMean = Math.max(0.05, averages.home * (homeStrength.attackHome / averages.home) * (awayStrength.defenseAway / averages.home))
    const awayMean = Math.max(0.05, averages.away * (awayStrength.attackAway / averages.away) * (homeStrength.defenseHome / averages.away))
    const ph = pmf(homeMean)
    const pa = pmf(awayMean)
    let rest = 0
    for (let h = 0; h < ph.length; h += 1) {
      for (let a = 0; a < pa.length; a += 1) {
        if (h <= 1 && a <= 1) continue
        rest += ph[h]! * pa[a]!
      }
    }
    prepared.push({ ph, pa, rest, homeMean, awayMean, observedHome: match.homeGoals, observedAway: match.awayGoals })
  }
  if (prepared.length === 0) return 0

  const logLikelihoodAt = (rho: number): number => {
    let total = 0
    for (const match of prepared) {
      const tau = tauFactor(match.observedHome, match.observedAway, rho, match.homeMean, match.awayMean)
      if (tau <= 0) return Number.NEGATIVE_INFINITY
      const z = match.rest
        + match.ph[0]! * match.pa[0]! * tauFactor(0, 0, rho, match.homeMean, match.awayMean)
        + match.ph[0]! * match.pa[1]! * tauFactor(0, 1, rho, match.homeMean, match.awayMean)
        + match.ph[1]! * match.pa[0]! * tauFactor(1, 0, rho, match.homeMean, match.awayMean)
        + match.ph[1]! * match.pa[1]! * tauFactor(1, 1, rho, match.homeMean, match.awayMean)
      if (z <= 0) return Number.NEGATIVE_INFINITY
      const observedMass = match.ph[match.observedHome]! * match.pa[match.observedAway]! * tau
      total += Math.log(observedMass / z)
    }
    return total
  }

  let bestRho = 0
  let bestLL = logLikelihoodAt(0)
  for (let rho = -0.15; rho <= 0.1001; rho += 0.005) {
    const ll = logLikelihoodAt(rho)
    if (ll > bestLL) {
      bestLL = ll
      bestRho = Math.round(rho * 1000) / 1000
    }
  }
  return bestRho
}
