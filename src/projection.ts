import { currentClubs, historicalSeasons, remainingFixtures, type ProjectionClub } from './projectionData'
import { currentSeasonResults, type CurrentSeasonMatch } from './currentSeasonResults'
import type { HistoricalMatch } from './historicalSeasons'
import {
  runFeatureBacktest,
  productionTrainingMatches,
  splitWalkForwardByKickoff,
  type FeatureBacktest,
} from './modelBacktest'
import { expectedGoalsForVariant } from './matchModel'
import { PointOutcomeCurveAccumulator, type PointCurveOutcome } from './pointCurve'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'
import {
  BACKTEST_CUTOFF,
  BACKTEST_SIMULATIONS,
  RESULT_GROUPS,
  SHRINKAGE_CANDIDATES,
  SHRINKAGE_MATCHES,
  SIMULATION_COUNT,
  SIMULATION_SEED,
  type ResultGroupId,
} from './projectionConfig'

export {
  BACKTEST_CUTOFF,
  BACKTEST_SIMULATIONS,
  RESULT_GROUPS,
  SHRINKAGE_CANDIDATES,
  SHRINKAGE_MATCHES,
  SIMULATION_COUNT,
  SIMULATION_SEED,
} from './projectionConfig'
export type { ResultGroupId } from './projectionConfig'

export interface ExpectedGoals {
  home: number
  away: number
}

export interface SimulatedClub {
  id: string
  club: string
  position: number
  points: number
  played: number
  wins: number
  goalsFor: number
  goalsAgainst: number
}

export interface SingleSeasonResult {
  table: SimulatedClub[]
  pointsAtStart: number
  pointsAdded: number
  totalPoints: number
}

export interface ClubProbability {
  id: string
  club: string
  currentPosition: number
  title: number
  libertadores: number
  sudamericana: number
  relegation: number
}

export interface ExactPointCount {
  points: number
  count: number
  probability: number
}

export interface OutcomeDistribution {
  id: ResultGroupId
  label: string
  samples: number
  points: ExactPointCount[]
}

export interface PointsAnalysis {
  distributionByOutcome: OutcomeDistribution[]
}

export interface PointCurveResult {
  rows: {
    points: number
    outcome: PointCurveOutcome
    successes: number
    denominator: number
    probability: number
    lower95: number
    upper95: number
    clusterCount: number
    lowSample: boolean
  }[]
  simulationCount: number
}

export interface BacktestSeason {
  year: number
  matches: number
  shrinkageMatches: number
  modelBrier: number
  baselineBrier: number
  tableBrier: number
  tableBaselineBrier: number
}

type MatchBacktestResult = Pick<BacktestSeason, 'year' | 'matches' | 'shrinkageMatches' | 'modelBrier' | 'baselineBrier'>

export interface BacktestSummary {
  cutoffMatches: number
  matches: number
  modelBrier: number
  baselineBrier: number
  relativeImprovement: number
  productionShrinkageMatches: number
  tableSimulationsPerSeason: number
  tableBrier: number
  tableBaselineBrier: number
  tableRelativeImprovement: number
  seasons: BacktestSeason[]
}

let cachedTemporalBacktest: BacktestSummary | null = null

export interface ProjectionResult {
  simulations: number
  seed: number
  clubProbabilities: ClubProbability[]
  pointsAnalysis: PointsAnalysis
  pointCurve: PointCurveResult
  leagueAverageGoals: { home: number; away: number }
  backtest: BacktestSummary
  featureBacktest: FeatureBacktest
}

interface MatchInput {
  home: string
  away: string
  homeGoals: number
  awayGoals: number
  kickoff: string
  sourceOrdinal: number
}

interface TeamTotals {
  played: number
  goalsFor: number
  goalsAgainst: number
  points: number
  wins: number
  draws: number
  losses: number
}

interface TeamState extends SimulationClub {
  index: number
  goalDifference: number
  h2hPoints: number[]
  h2hGoalDifference: number[]
  drawOrder: number
}

interface SimulationClub {
  id: string
  club: string
  position: number
  points: number
  played: number
  wins: number
  goalsFor: number
  goalsAgainst: number
}

export interface HeadToHeadRecord {
  points: number
  goalDifference: number
}

export type HeadToHeadMatrix = ReadonlyMap<string, ReadonlyMap<string, HeadToHeadRecord>>

interface PointOutcomeSample {
  points: number
  outcome: ResultGroupId
}

interface PointCountAccumulator {
  outcomeCounts: Record<ResultGroupId, Map<number, number>>
}

interface RandomSource {
  next(): number
}

function historicalGoalAverages(matches: readonly MatchInput[]): { home: number; away: number } {
  const totals = matches.reduce((sum, match) => ({
    home: sum.home + match.homeGoals,
    away: sum.away + match.awayGoals,
  }), { home: 0, away: 0 })
  return { home: totals.home / matches.length, away: totals.away / matches.length }
}

function historicalMatches(seasons = historicalSeasons): MatchInput[] {
  return seasons.flatMap((season) => season.matches.map((match) => historicalMatchInput(season.teamIds, match)))
}

function historicalMatchInput(teamIds: readonly string[], [home, away, homeGoals, awayGoals, kickoff, sourceOrdinal]: HistoricalMatch): MatchInput {
  return {
    home: teamIds[home]!,
    away: teamIds[away]!,
    homeGoals,
    awayGoals,
    kickoff,
    sourceOrdinal,
  }
}

function compareHistoricalChronology(left: MatchInput, right: MatchInput): number {
  return left.kickoff.localeCompare(right.kickoff) || left.sourceOrdinal - right.sourceOrdinal
}

const packedHistoricalMatches = historicalMatches()
const fullHistoryGoalAverages = historicalGoalAverages(packedHistoricalMatches)

function createRandom(seed: number): RandomSource {
  let state = seed >>> 0
  if (state === 0) state = 0x6d2b79f5
  return {
    next(): number {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return (state >>> 0) / 4_294_967_296
    },
  }
}

function poissonSample(mean: number, random: RandomSource): number {
  const limit = Math.exp(-mean)
  let product = 1
  let goals = 0
  do {
    goals += 1
    product *= random.next()
  } while (product > limit)
  return goals - 1
}

function expectedGoalsForTeams(
  home: Pick<ProjectionClub, 'played' | 'goalsFor' | 'goalsAgainst'>,
  away: Pick<ProjectionClub, 'played' | 'goalsFor' | 'goalsAgainst'>,
  averages: { home: number; away: number },
  shrinkageMatches = SHRINKAGE_MATCHES,
): ExpectedGoals {
  const averageTeamGoals = (averages.home + averages.away) / 2
  const strength = (team: Pick<ProjectionClub, 'played' | 'goalsFor' | 'goalsAgainst'>): { attack: number; defense: number } => ({
    attack: (team.goalsFor + shrinkageMatches * averageTeamGoals) / (team.played + shrinkageMatches) / averageTeamGoals,
    defense: (team.goalsAgainst + shrinkageMatches * averageTeamGoals) / (team.played + shrinkageMatches) / averageTeamGoals,
  })
  const homeStrength = strength(home)
  const awayStrength = strength(away)
  return {
    home: averages.home * homeStrength.attack * awayStrength.defense,
    away: averages.away * awayStrength.attack * homeStrength.defense,
  }
}

export function estimateExpectedGoals(homeId: string, awayId: string): ExpectedGoals {
  const home = currentClubs.find((club) => club.id === homeId)
  const away = currentClubs.find((club) => club.id === awayId)
  if (!home || !away) throw new Error(`Clube desconhecido no confronto: ${homeId}–${awayId}`)
  const backtest = runFeatureBacktest()
  const variant = backtest.productionUsesH2H ? 'combined' : 'home-away'
  return expectedGoalsForVariant(
    homeId,
    awayId,
    productionTrainingMatches,
    2026,
    variant,
    backtest.productionShrinkageMatches,
  )
}

function poissonProbabilities(mean: number, maxGoals = 12): number[] {
  const probabilities = [Math.exp(-mean)]
  for (let goals = 0; goals < maxGoals; goals += 1) {
    probabilities.push(probabilities[goals]! * mean / (goals + 1))
  }
  const total = probabilities.reduce((sum, value) => sum + value, 0)
  return probabilities.map((value) => value / total)
}

function resultProbabilities(expected: ExpectedGoals): [number, number, number] {
  const home = poissonProbabilities(expected.home)
  const away = poissonProbabilities(expected.away)
  const probabilities: [number, number, number] = [0, 0, 0]
  for (let homeGoals = 0; homeGoals < home.length; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals < away.length; awayGoals += 1) {
      const resultIndex = homeGoals > awayGoals ? 0 : homeGoals === awayGoals ? 1 : 2
      probabilities[resultIndex] += home[homeGoals]! * away[awayGoals]!
    }
  }
  const total = probabilities.reduce((sum, value) => sum + value, 0)
  return probabilities.map((value) => value / total) as [number, number, number]
}

function getOutcome(position: number): ResultGroupId {
  if (position === 1) return 'champion'
  if (position <= 5) return 'libertadores'
  if (position <= 11) return 'sudamericana'
  if (position <= 16) return 'middle'
  return 'relegation'
}

function createAccumulator(): PointCountAccumulator {
  const outcomeCounts = Object.fromEntries(RESULT_GROUPS.map(({ id }) => [id, new Map<number, number>()])) as Record<ResultGroupId, Map<number, number>>
  return { outcomeCounts }
}

function analysisFromAccumulator(accumulator: PointCountAccumulator): PointsAnalysis {
  const distributionByOutcome = RESULT_GROUPS.map(({ id, label }): OutcomeDistribution => {
    const pointCounts = accumulator.outcomeCounts[id]!
    const samples = [...pointCounts.values()].reduce((sum, count) => sum + count, 0)
    return {
      id,
      label,
      samples,
      points: [...pointCounts.entries()]
        .filter(([, count]) => count > 0)
        .sort(([left], [right]) => left - right)
        .map(([points, count]) => ({ points, count, probability: count / samples })),
    }
  })
  return { distributionByOutcome }
}

export function buildPointsAnalysis(samples: readonly PointOutcomeSample[]): PointsAnalysis {
  const accumulator = createAccumulator()
  for (const sample of samples) {
    if (!Number.isInteger(sample.points) || !RESULT_GROUPS.some(({ id }) => id === sample.outcome)) continue
    const pointCounts = accumulator.outcomeCounts[sample.outcome]!
    pointCounts.set(sample.points, (pointCounts.get(sample.points) ?? 0) + 1)
  }
  return analysisFromAccumulator(accumulator)
}

function baseTie(a: TeamState, b: TeamState): number {
  return b.points - a.points
    || b.wins - a.wins
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor
}

function sameFirstFourCriteria(a: TeamState, b: TeamState): boolean {
  return a.points === b.points
    && a.wins === b.wins
    && a.goalDifference === b.goalDifference
    && a.goalsFor === b.goalsFor
}

export function buildCurrentSeasonHeadToHead(
  matches: readonly CurrentSeasonMatch[] = currentSeasonResults,
): HeadToHeadMatrix {
  const matrix = new Map<string, Map<string, HeadToHeadRecord>>()
  for (const match of filterAtOrBeforeAnalyticalCutoff(matches)) {
    const homePoints = match.homeGoals > match.awayGoals ? 3 : match.homeGoals === match.awayGoals ? 1 : 0
    const awayPoints = match.awayGoals > match.homeGoals ? 3 : match.awayGoals === match.homeGoals ? 1 : 0
    addHeadToHead(matrix, match.home, match.away, homePoints, match.homeGoals - match.awayGoals)
    addHeadToHead(matrix, match.away, match.home, awayPoints, match.awayGoals - match.homeGoals)
  }
  return matrix
}

export function compareHeadToHeadForTable(a: HeadToHeadRecord, b: HeadToHeadRecord): number {
  return b.points - a.points || b.goalDifference - a.goalDifference
}

function finalTable(states: TeamState[]): SimulatedClub[] {
  const byKnownCriteria = [...states].sort(baseTie)
  const sorted: TeamState[] = []
  for (let start = 0; start < byKnownCriteria.length;) {
    let end = start + 1
    while (end < byKnownCriteria.length && sameFirstFourCriteria(byKnownCriteria[start]!, byKnownCriteria[end]!)) end += 1
    const group = byKnownCriteria.slice(start, end)
    if (group.length === 2) {
      group.sort((a, b) => compareHeadToHeadForTable(
        { points: a.h2hPoints[b.index]!, goalDifference: a.h2hGoalDifference[b.index]! },
        { points: b.h2hPoints[a.index]!, goalDifference: b.h2hGoalDifference[a.index]! },
      ) || a.drawOrder - b.drawOrder)
    } else {
      group.sort((a, b) => a.drawOrder - b.drawOrder)
    }
    sorted.push(...group)
    start = end
  }
  return sorted.map((state, index) => ({
    id: state.id,
    club: state.club,
    position: index + 1,
    points: state.points,
    played: state.played,
    wins: state.wins,
    goalsFor: state.goalsFor,
    goalsAgainst: state.goalsAgainst,
  }))
}

function initialTeamStates(
  random: RandomSource,
  clubs: readonly SimulationClub[],
  initialHeadToHead: HeadToHeadMatrix = new Map(),
): TeamState[] {
  return clubs.map((club, index) => ({
    ...club,
    index,
    goalDifference: club.goalsFor - club.goalsAgainst,
    h2hPoints: clubs.map((opponent) => initialHeadToHead.get(club.id)?.get(opponent.id)?.points ?? 0),
    h2hGoalDifference: clubs.map((opponent) => initialHeadToHead.get(club.id)?.get(opponent.id)?.goalDifference ?? 0),
    drawOrder: random.next(),
  }))
}

function simulateSeason(
  random: RandomSource,
  clubs: readonly SimulationClub[],
  fixtures: readonly { home: string; away: string }[],
  expectedGoals: readonly ExpectedGoals[],
  initialHeadToHead: HeadToHeadMatrix = new Map(),
): SingleSeasonResult {
  if (fixtures.length !== expectedGoals.length) throw new Error('Cada jogo precisa de uma estimativa de gols esperados.')
  const states = initialTeamStates(random, clubs, initialHeadToHead)
  const stateById = new Map(states.map((state, index) => [state.id, { state, index }]))
  const pointsAtStart = states.reduce((sum, state) => sum + state.points, 0)
  let pointsAdded = 0

  fixtures.forEach((fixture, fixtureIndex) => {
    const homeEntry = stateById.get(fixture.home)
    const awayEntry = stateById.get(fixture.away)
    const goalsMean = expectedGoals[fixtureIndex]!
    if (!homeEntry || !awayEntry) throw new Error(`Fixture contém clube desconhecido: ${fixture.home}–${fixture.away}`)
    const homeGoals = poissonSample(goalsMean.home, random)
    const awayGoals = poissonSample(goalsMean.away, random)
    const home = homeEntry.state
    const away = awayEntry.state

    home.played += 1
    away.played += 1
    home.goalsFor += homeGoals
    home.goalsAgainst += awayGoals
    away.goalsFor += awayGoals
    away.goalsAgainst += homeGoals
    home.goalDifference = home.goalsFor - home.goalsAgainst
    away.goalDifference = away.goalsFor - away.goalsAgainst

    const h2hPoints = homeGoals > awayGoals ? [3, 0] : homeGoals < awayGoals ? [0, 3] : [1, 1]
    home.h2hPoints[awayEntry.index] = home.h2hPoints[awayEntry.index]! + h2hPoints[0]
    away.h2hPoints[homeEntry.index] = away.h2hPoints[homeEntry.index]! + h2hPoints[1]
    home.h2hGoalDifference[awayEntry.index] = home.h2hGoalDifference[awayEntry.index]! + homeGoals - awayGoals
    away.h2hGoalDifference[homeEntry.index] = away.h2hGoalDifference[homeEntry.index]! + awayGoals - homeGoals

    if (homeGoals > awayGoals) {
      home.points += 3
      home.wins += 1
      pointsAdded += 3
    } else if (homeGoals < awayGoals) {
      away.points += 3
      away.wins += 1
      pointsAdded += 3
    } else {
      home.points += 1
      away.points += 1
      pointsAdded += 2
    }
  })

  const table = finalTable(states)
  return {
    table,
    pointsAtStart,
    pointsAdded,
    totalPoints: table.reduce((sum, club) => sum + club.points, 0),
  }
}

export function simulateOneSeason(seed: number): SingleSeasonResult {
  const random = createRandom(seed)
  const expectedGoals = remainingFixtures.map((fixture) => estimateExpectedGoals(fixture.home, fixture.away))
  return simulateSeason(random, currentClubs, remainingFixtures, expectedGoals, buildCurrentSeasonHeadToHead())
}

function createBacktestSeason(year: number): { seasonMatches: MatchInput[]; priorMatches: MatchInput[] } {
  const season = historicalSeasons.find((entry) => entry.year === year)
  if (!season) throw new Error(`Temporada histórica não empacotada: ${year}`)
  const seasonMatches = season.matches
    .map((match) => historicalMatchInput(season.teamIds, match))
    .sort(compareHistoricalChronology)
  const priorMatches = historicalMatches(historicalSeasons.filter((entry) => entry.year < year))
  return { seasonMatches, priorMatches }
}

function seasonToDateTotals(matches: readonly MatchInput[]): Map<string, TeamTotals> {
  const totals = new Map<string, TeamTotals>()
  for (const match of matches) {
    for (const [id, goalsFor, goalsAgainst] of [
      [match.home, match.homeGoals, match.awayGoals],
      [match.away, match.awayGoals, match.homeGoals],
    ] as const) {
      const total = totals.get(id) ?? { played: 0, goalsFor: 0, goalsAgainst: 0, points: 0, wins: 0, draws: 0, losses: 0 }
      total.played += 1
      total.goalsFor += goalsFor
      total.goalsAgainst += goalsAgainst
      if (goalsFor > goalsAgainst) {
        total.points += 3
        total.wins += 1
      } else if (goalsFor === goalsAgainst) {
        total.points += 1
        total.draws += 1
      } else {
        total.losses += 1
      }
      totals.set(id, total)
    }
  }
  return totals
}

function scoringPrediction(
  homeId: string,
  awayId: string,
  totals: ReadonlyMap<string, TeamTotals>,
  averages: { home: number; away: number },
  shrinkageMatches: number,
): [number, number, number] {
  const home = totals.get(homeId)
  const away = totals.get(awayId)
  if (!home || !away) throw new Error(`Clube ainda sem partidas no corte do backtest: ${homeId}–${awayId}`)
  return resultProbabilities(expectedGoalsForTeams(home, away, averages, shrinkageMatches))
}

function brierScore(
  predicted: readonly [number, number, number],
  actual: 0 | 1 | 2,
): number {
  return predicted.reduce((sum, probability, index) => sum + (probability - Number(index === actual)) ** 2, 0)
}

function evaluateHistoricalYear(year: number, shrinkageMatches: number): MatchBacktestResult {
  const { seasonMatches, priorMatches } = createBacktestSeason(year)
  const { training: cutoff, test: testMatches } = splitWalkForwardByKickoff(seasonMatches, BACKTEST_CUTOFF)
  const trainingMatches = [...priorMatches, ...cutoff]
  const averages = historicalGoalAverages(trainingMatches)
  const totals = seasonToDateTotals(cutoff)
  const resultCounts: [number, number, number] = [0, 0, 0]
  for (const match of trainingMatches) {
    const outcome = match.homeGoals > match.awayGoals ? 0 : match.homeGoals === match.awayGoals ? 1 : 2
    resultCounts[outcome] += 1
  }
  const baseline = resultCounts.map((count) => count / trainingMatches.length) as [number, number, number]
  let modelSeasonBrier = 0
  let baselineSeasonBrier = 0
  for (const match of testMatches) {
    const actual = (match.homeGoals > match.awayGoals ? 0 : match.homeGoals === match.awayGoals ? 1 : 2) as 0 | 1 | 2
    modelSeasonBrier += brierScore(scoringPrediction(match.home, match.away, totals, averages, shrinkageMatches), actual)
    baselineSeasonBrier += brierScore(baseline, actual)
  }

  return {
    year,
    matches: testMatches.length,
    shrinkageMatches,
    modelBrier: modelSeasonBrier / testMatches.length,
    baselineBrier: baselineSeasonBrier / testMatches.length,
  }
}

function historicalOutcomeGroup(position: number): ResultGroupId {
  if (position === 1) return 'champion'
  if (position <= 6) return 'libertadores'
  if (position <= 12) return 'sudamericana'
  if (position <= 16) return 'middle'
  return 'relegation'
}

function addHeadToHead(
  matrix: Map<string, Map<string, HeadToHeadRecord>>,
  club: string,
  opponent: string,
  points: number,
  goalDifference: number,
): void {
  const opponents = matrix.get(club) ?? new Map<string, HeadToHeadRecord>()
  const current = opponents.get(opponent) ?? { points: 0, goalDifference: 0 }
  current.points += points
  current.goalDifference += goalDifference
  opponents.set(opponent, current)
  matrix.set(club, opponents)
}

function historicalTableBacktest(year: number, shrinkageMatches: number): { tableBrier: number; tableBaselineBrier: number } {
  const { seasonMatches, priorMatches } = createBacktestSeason(year)
  const { training: cutoff, test } = splitWalkForwardByKickoff(seasonMatches, BACKTEST_CUTOFF)
  const futureFixtures = test.map(({ home, away }) => ({ home, away }))
  const trainingMatches = [...priorMatches, ...cutoff]
  const averages = historicalGoalAverages(trainingMatches)
  const totals = seasonToDateTotals(cutoff)
  const season = historicalSeasons.find((entry) => entry.year === year)!
  const headToHead = new Map<string, Map<string, HeadToHeadRecord>>()

  for (const match of cutoff) {
    const homePoints = match.homeGoals > match.awayGoals ? 3 : match.homeGoals === match.awayGoals ? 1 : 0
    const awayPoints = match.awayGoals > match.homeGoals ? 3 : match.awayGoals === match.homeGoals ? 1 : 0
    addHeadToHead(headToHead, match.home, match.away, homePoints, match.homeGoals - match.awayGoals)
    addHeadToHead(headToHead, match.away, match.home, awayPoints, match.awayGoals - match.homeGoals)
  }

  const clubs: SimulationClub[] = season.teamIds.map((id, index) => {
    const total = totals.get(id)
    if (!total) throw new Error(`Sem dados de temporada no corte: ${year} ${id}`)
    return {
      id,
      club: id,
      position: index + 1,
      points: total.points,
      played: total.played,
      wins: total.wins,
      goalsFor: total.goalsFor,
      goalsAgainst: total.goalsAgainst,
    }
  })
  const expectedGoals = futureFixtures.map((fixture) => {
    const home = totals.get(fixture.home)
    const away = totals.get(fixture.away)
    if (!home || !away) throw new Error(`Confronto sem histórico no corte: ${fixture.home}–${fixture.away}`)
    return expectedGoalsForTeams(home, away, averages, shrinkageMatches)
  })

  const currentTable = finalTable(initialTeamStates(createRandom(20_260_000 + year), clubs, headToHead))
  const actualPosition = new Map(season.officialStandings.map(([id], index) => [id, index + 1]))
  const actualOutcome = new Map(clubs.map((club) => [club.id, RESULT_GROUPS.findIndex(({ id }) => id === historicalOutcomeGroup(actualPosition.get(club.id)!))]))
  const baselineOutcome = new Map(currentTable.map((club) => [club.id, RESULT_GROUPS.findIndex(({ id }) => id === historicalOutcomeGroup(club.position))]))
  const simulatedCounts = new Map(clubs.map((club) => [club.id, RESULT_GROUPS.map(() => 0)]))
  const random = createRandom(20_260_000 + year * 100)

  for (let simulation = 0; simulation < BACKTEST_SIMULATIONS; simulation += 1) {
    const table = simulateSeason(random, clubs, futureFixtures, expectedGoals, headToHead).table
    for (const club of table) {
      const group = RESULT_GROUPS.findIndex(({ id }) => id === historicalOutcomeGroup(club.position))
      simulatedCounts.get(club.id)![group]! += 1
    }
  }

  let modelBrier = 0
  let currentTableBrier = 0
  for (const club of clubs) {
    const observed = actualOutcome.get(club.id)!
    const current = baselineOutcome.get(club.id)!
    const probabilities = simulatedCounts.get(club.id)!.map((count) => count / BACKTEST_SIMULATIONS)
    modelBrier += probabilities.reduce((sum, probability, group) => sum + (probability - Number(group === observed)) ** 2, 0)
    currentTableBrier += RESULT_GROUPS.reduce((sum, _group, group) => sum + (Number(group === current) - Number(group === observed)) ** 2, 0)
  }
  return { tableBrier: modelBrier / clubs.length, tableBaselineBrier: currentTableBrier / clubs.length }
}

export function runTemporalBacktest(): BacktestSummary {
  if (cachedTemporalBacktest) return cachedTemporalBacktest
  const seasons: BacktestSeason[] = []
  const candidatesByYear = new Map<number, MatchBacktestResult[]>()

  for (const season of historicalSeasons) {
    const priorResults = seasons
    const shrinkageMatches = priorResults.length === 0
      ? 12
      : SHRINKAGE_CANDIDATES.reduce((best, candidate) => {
        const priorScore = priorResults.reduce((sum, result) => sum + candidatesByYear.get(result.year)!.find((entry) => entry.shrinkageMatches === candidate)!.modelBrier, 0)
        const bestScore = priorResults.reduce((sum, result) => sum + candidatesByYear.get(result.year)!.find((entry) => entry.shrinkageMatches === best)!.modelBrier, 0)
        return priorScore < bestScore ? candidate : best
      }, SHRINKAGE_CANDIDATES[0])
    seasons.push({
      ...evaluateHistoricalYear(season.year, shrinkageMatches),
      ...historicalTableBacktest(season.year, shrinkageMatches),
    })
    candidatesByYear.set(season.year, SHRINKAGE_CANDIDATES.map((candidate) => evaluateHistoricalYear(season.year, candidate)))
  }

  const matchesTotal = seasons.reduce((sum, season) => sum + season.matches, 0)
  const modelBrier = seasons.reduce((sum, season) => sum + season.modelBrier * season.matches, 0) / matchesTotal
  const baselineBrier = seasons.reduce((sum, season) => sum + season.baselineBrier * season.matches, 0) / matchesTotal
  const tableBrier = seasons.reduce((sum, season) => sum + season.tableBrier, 0) / seasons.length
  const tableBaselineBrier = seasons.reduce((sum, season) => sum + season.tableBaselineBrier, 0) / seasons.length
  const productionShrinkageMatches = SHRINKAGE_CANDIDATES.reduce((best, candidate) => {
    const candidateScore = historicalSeasons.reduce((sum, season) => sum + candidatesByYear.get(season.year)!.find((entry) => entry.shrinkageMatches === candidate)!.modelBrier, 0)
    const bestScore = historicalSeasons.reduce((sum, season) => sum + candidatesByYear.get(season.year)!.find((entry) => entry.shrinkageMatches === best)!.modelBrier, 0)
    return candidateScore < bestScore ? candidate : best
  }, SHRINKAGE_CANDIDATES[0])
  cachedTemporalBacktest = {
    cutoffMatches: BACKTEST_CUTOFF,
    matches: matchesTotal,
    modelBrier,
    baselineBrier,
    relativeImprovement: (baselineBrier - modelBrier) / baselineBrier,
    productionShrinkageMatches,
    tableSimulationsPerSeason: BACKTEST_SIMULATIONS,
    tableBrier,
    tableBaselineBrier,
    tableRelativeImprovement: (tableBaselineBrier - tableBrier) / tableBaselineBrier,
    seasons,
  }
  return cachedTemporalBacktest
}

export function validateHistoricalSeason(season: (typeof historicalSeasons)[number]): { matches: number; clubs: number; mismatchedClubs: number } {
  const totals = seasonToDateTotals(historicalMatches([season]))
  const mismatchedClubs = season.officialStandings.filter(([id, points, played, wins, draws, losses, goalsFor, goalsAgainst]) => {
    const actual = totals.get(id)
    return !actual
      || actual.points !== points
      || actual.played !== played
      || actual.wins !== wins
      || actual.draws !== draws
      || actual.losses !== losses
      || actual.goalsFor !== goalsFor
      || actual.goalsAgainst !== goalsAgainst
  }).length
  return { matches: season.matches.length, clubs: season.teamIds.length, mismatchedClubs }
}

function createExpectedGoals(): ExpectedGoals[] {
  return remainingFixtures.map((fixture) => estimateExpectedGoals(fixture.home, fixture.away))
}

export function runProjection(options: { simulations?: number; seed?: number } = {}): ProjectionResult {
  const simulations = options.simulations ?? SIMULATION_COUNT
  const seed = options.seed ?? SIMULATION_SEED
  if (!Number.isInteger(simulations) || simulations < 1) throw new Error('O número de simulações deve ser um inteiro positivo.')

  const random = createRandom(seed)
  const expectedGoals = createExpectedGoals()
  const initialHeadToHead = buildCurrentSeasonHeadToHead()
  const probabilityCounts = new Map(currentClubs.map((club) => [club.id, { title: 0, libertadores: 0, sudamericana: 0, relegation: 0 }]))
  const pointAccumulator = createAccumulator()
  const pointCurveAccumulator = new PointOutcomeCurveAccumulator(simulations)
  const featureBacktest = runFeatureBacktest()

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const season = simulateSeason(random, currentClubs, remainingFixtures, expectedGoals, initialHeadToHead)
    for (const club of season.table) {
      const counts = probabilityCounts.get(club.id)!
      if (club.position === 1) counts.title += 1
      if (club.position <= 5) counts.libertadores += 1
      if (club.position >= 6 && club.position <= 11) counts.sudamericana += 1
      if (club.position >= 17) counts.relegation += 1
      const outcome = getOutcome(club.position)
      pointCurveAccumulator.add({ simulation, club: club.id, points: club.points, position: club.position })
      const pointCounts = pointAccumulator.outcomeCounts[outcome]!
      pointCounts.set(club.points, (pointCounts.get(club.points) ?? 0) + 1)
    }
  }

  return {
    simulations,
    seed,
    clubProbabilities: currentClubs.map((club) => {
      const counts = probabilityCounts.get(club.id)!
      return {
        id: club.id,
        club: club.club,
        currentPosition: club.position,
        title: counts.title / simulations,
        libertadores: counts.libertadores / simulations,
        sudamericana: counts.sudamericana / simulations,
        relegation: counts.relegation / simulations,
      }
    }),
    pointsAnalysis: analysisFromAccumulator(pointAccumulator),
    pointCurve: pointCurveAccumulator.build(),
    leagueAverageGoals: fullHistoryGoalAverages,
    backtest: runTemporalBacktest(),
    featureBacktest,
  }
}
