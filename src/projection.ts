import { currentClubs, historicalSeasons, remainingFixtures } from './projectionData'
import { currentSeasonResults, type CurrentSeasonMatch } from './currentSeasonResults'
import type { HistoricalMatch } from './historicalSeasons'
import {
  runFeatureBacktest,
  runXgBlendAblation,
  productionTrainingMatches,
  productionXgMatches,
  splitWalkForwardByKickoff,
  type FeatureBacktest,
} from './modelBacktest'
import {
  blendExpectedGoals,
  expectedGoalsForVariant,
  expectedGoalsFromTeamTotals,
  expectedGoalsFromXg,
  historicalGoalAverages,
  poissonResultProbabilities,
} from './matchModel'
import { PointOutcomeCurveAccumulator, type PointOutcomeCurve } from './pointCurve'
import { PointsDistributionAccumulator, probabilityWithInterval, type PointsStats, type ProbabilityInterval } from './pointsDistribution'
import { normalizeTeamId } from './clubIds'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'
import { disciplineTable, disciplineTiebreak } from './discipline'
import {
  BACKTEST_CUTOFF,
  BACKTEST_SIMULATIONS,
  isPositionInZone,
  RESULT_GROUPS,
  SHRINKAGE_CANDIDATES,
  SIMULATION_COUNT,
  SIMULATION_SEED,
  XG_BLEND_WEIGHT,
  ZONES,
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
  isPositionInZone,
  ZONES,
} from './projectionConfig'
export type { ResultGroupId } from './projectionConfig'
export type { PointsStats, ProbabilityInterval } from './pointsDistribution'

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
  currentPoints: number
  title: number
  libertadores: number
  sudamericana: number
  relegation: number
  titleInterval: ProbabilityInterval
  libertadoresInterval: ProbabilityInterval
  sudamericanaInterval: ProbabilityInterval
  relegationInterval: ProbabilityInterval
  pointsStats: PointsStats
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

export type PointCurveResult = PointOutcomeCurve

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
  /** Média de gols do histórico puro 2021–2025 (1.900 jogos), referência editorial. */
  leagueAverageGoals: { home: number; away: number }
  /** Média de gols da base efetivamente usada pelo modelo de produção (histórico + 2026 até o corte). */
  trainingGoalAverages: { home: number; away: number }
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
  h2hGoalsFor: number[]
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
  goalsFor: number
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

// A média de gols, a fórmula de gols esperados e as probabilidades de Poisson
// vivem em matchModel.ts; este módulo apenas as consome (auditoria: fórmulas
// duplicadas com guardas divergentes entre projection.ts e matchModel.ts).

function historicalMatches(seasons = historicalSeasons): MatchInput[] {
  return seasons.flatMap((season) => season.matches.map((match) => historicalMatchInput(season.teamIds, match)))
}

function historicalMatchInput(teamIds: readonly string[], [home, away, homeGoals, awayGoals, kickoff, sourceOrdinal]: HistoricalMatch): MatchInput {
  return {
    home: normalizeTeamId(teamIds[home]!),
    away: normalizeTeamId(teamIds[away]!),
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

export function estimateExpectedGoals(homeId: string, awayId: string): ExpectedGoals {
  const home = currentClubs.find((club) => club.id === homeId)
  const away = currentClubs.find((club) => club.id === awayId)
  if (!home || !away) throw new Error(`Clube desconhecido no confronto: ${homeId}–${awayId}`)
  const backtest = runFeatureBacktest()
  const variant = backtest.productionUsesH2H ? 'combined' : 'home-away'
  const goalsExpected = expectedGoalsForVariant(
    homeId,
    awayId,
    productionTrainingMatches,
    2026,
    variant,
    backtest.productionShrinkageMatches,
  )
  // Blend xG × gols (§18): peso fixo calibrado pelo walk-forward por rodada;
  // sem cobertura suficiente de xG, o modelo permanece só em gols.
  if (XG_BLEND_WEIGHT <= 0) return goalsExpected
  const xgAblation = runXgBlendAblation()
  if (!xgAblation.eligible) return goalsExpected
  return blendExpectedGoals(goalsExpected, expectedGoalsFromXg(homeId, awayId, productionXgMatches, backtest.productionShrinkageMatches), XG_BLEND_WEIGHT)
}

function getOutcome(position: number): ResultGroupId {
  if (position === 1) return 'champion'
  if (position <= ZONES.libertadores.to) return 'libertadores'
  if (position <= ZONES.sudamericana.to) return 'sudamericana'
  if (position <= ZONES.middle.to) return 'middle'
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
    // Pontuação negativa não existe no formato de pontos corridos; descartar
    // evita que amostras corrompidas gerem categorias impossíveis (auditoria).
    if (!Number.isInteger(sample.points) || sample.points < 0 || !RESULT_GROUPS.some(({ id }) => id === sample.outcome)) continue
    const pointCounts = accumulator.outcomeCounts[sample.outcome]!
    pointCounts.set(sample.points, (pointCounts.get(sample.points) ?? 0) + 1)
  }
  return analysisFromAccumulator(accumulator)
}

/**
 * Disciplina projetada para o desempate (Art. 15, itens 5/6): constante por
 * temporada — cartões reais + taxa por jogo × jogos restantes — derivada uma
 * única vez, fora do loop de simulação.
 */
const PROJECTED_DISCIPLINE = disciplineTable()

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
    addHeadToHead(matrix, match.home, match.away, homePoints, match.homeGoals - match.awayGoals, match.homeGoals)
    addHeadToHead(matrix, match.away, match.home, awayPoints, match.awayGoals - match.homeGoals, match.awayGoals)
  }
  return matrix
}

/**
 * Critérios CBF/REC para confronto direto entre dois clubes:
 * 1) pontos no confronto; 2) saldo de gols no confronto; 3) gols marcados
 * no confronto. O terceiro critério foi incluído na auditoria — antes a
 * comparação parava no saldo e caía no sorteio.
 */
export function compareHeadToHeadForTable(a: HeadToHeadRecord, b: HeadToHeadRecord): number {
  return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
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
        { points: a.h2hPoints[b.index]!, goalDifference: a.h2hGoalDifference[b.index]!, goalsFor: a.h2hGoalsFor[b.index]! },
        { points: b.h2hPoints[a.index]!, goalDifference: b.h2hGoalDifference[a.index]!, goalsFor: b.h2hGoalsFor[a.index]! },
      ) || a.drawOrder - b.drawOrder)
    } else {
      // Art. 15 do REC 2026 (CBF): para 3+ empatados, após gols pró vêm
      // cartões vermelhos (menor) e amarelos (menor) — projetados pela taxa
      // por jogo da temporada (fonte 365scores); restam empatados, o sorteio
      // reprodutível é o passo final da sequência oficial.
      group.sort((a, b) => disciplineTiebreak(PROJECTED_DISCIPLINE, a.id, b.id) || a.drawOrder - b.drawOrder)
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
    h2hGoalsFor: clubs.map((opponent) => initialHeadToHead.get(club.id)?.get(opponent.id)?.goalsFor ?? 0),
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
    home.h2hGoalsFor[awayEntry.index] = home.h2hGoalsFor[awayEntry.index]! + homeGoals
    away.h2hGoalsFor[homeEntry.index] = away.h2hGoalsFor[homeEntry.index]! + awayGoals

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
  return poissonResultProbabilities(expectedGoalsFromTeamTotals(home, away, averages, shrinkageMatches))
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
    // Divisão guardada: fold sem partidas de teste devolve 0 em vez de NaN
    // (auditoria: divisões sem guarda).
    modelBrier: testMatches.length === 0 ? 0 : modelSeasonBrier / testMatches.length,
    baselineBrier: testMatches.length === 0 ? 0 : baselineSeasonBrier / testMatches.length,
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
  goalsFor: number,
): void {
  const opponents = matrix.get(club) ?? new Map<string, HeadToHeadRecord>()
  const current = opponents.get(opponent) ?? { points: 0, goalDifference: 0, goalsFor: 0 }
  current.points += points
  current.goalDifference += goalDifference
  current.goalsFor += goalsFor
  opponents.set(opponent, current)
  matrix.set(club, opponents)
}

/**
 * Classificação final derivada dos próprios placares empacotados — usada nas
 * temporadas sem standings oficiais verificados (2012–2020) como realidade de
 * referência do backtest de tabela. Entre empatados, a ordem pode divergir do
 * oficial (critérios não simulados), com impacto desprezível no Brier.
 */
function deriveSeasonPositions(season: (typeof historicalSeasons)[number]): Map<string, number> {
  const totals = seasonToDateTotals(historicalMatches([season]))
  const rows = [...totals.entries()].map(([id, total]) => ({ id, ...total }))
  rows.sort((left, right) => right.points - left.points
    || right.wins - left.wins
    || (right.goalsFor - right.goalsAgainst) - (left.goalsFor - left.goalsAgainst)
    || right.goalsFor - left.goalsFor
    || left.id.localeCompare(right.id))
  return new Map(rows.map((row, index) => [row.id, index + 1]))
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
    addHeadToHead(headToHead, match.home, match.away, homePoints, match.homeGoals - match.awayGoals, match.homeGoals)
    addHeadToHead(headToHead, match.away, match.home, awayPoints, match.awayGoals - match.homeGoals, match.awayGoals)
  }

  const clubs: SimulationClub[] = season.teamIds.map((rawId, index) => {
    const id = normalizeTeamId(rawId)
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
    return expectedGoalsFromTeamTotals(home, away, averages, shrinkageMatches)
  })

  const currentTable = finalTable(initialTeamStates(createRandom(20_260_000 + year), clubs, headToHead))
  const actualPosition = season.officialStandings
    ? new Map(season.officialStandings.map(([rawId], index) => [normalizeTeamId(rawId), index + 1]))
    : deriveSeasonPositions(season)
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
  // k de produção escolhido por walk-forward: o mesmo k aplicado à última
  // temporada usando apenas os anos anteriores — seleção fora da amostra.
  // Antes da auditoria o k era escolhido in-sample sobre as 5 temporadas
  // exibidas (viés de seleção no número publicado).
  const productionShrinkageMatches = seasons[seasons.length - 1]!.shrinkageMatches
  const relativeImprovement = (baseline: number, model: number): number => (baseline === 0 ? 0 : (baseline - model) / baseline)
  cachedTemporalBacktest = {
    cutoffMatches: BACKTEST_CUTOFF,
    matches: matchesTotal,
    modelBrier,
    baselineBrier,
    relativeImprovement: relativeImprovement(baselineBrier, modelBrier),
    productionShrinkageMatches,
    tableSimulationsPerSeason: BACKTEST_SIMULATIONS,
    tableBrier,
    tableBaselineBrier,
    tableRelativeImprovement: relativeImprovement(tableBaselineBrier, tableBrier),
    seasons,
  }
  return cachedTemporalBacktest
}

export function validateHistoricalSeason(season: (typeof historicalSeasons)[number]): { matches: number; clubs: number; mismatchedClubs: number; standingsVerified: boolean } {
  if (!season.officialStandings) {
    return { matches: season.matches.length, clubs: season.teamIds.length, mismatchedClubs: 0, standingsVerified: false }
  }
  const totals = seasonToDateTotals(historicalMatches([season]))
  const mismatchedClubs = season.officialStandings.filter(([rawId, points, played, wins, draws, losses, goalsFor, goalsAgainst]) => {
    const actual = totals.get(normalizeTeamId(rawId))
    return !actual
      || actual.points !== points
      || actual.played !== played
      || actual.wins !== wins
      || actual.draws !== draws
      || actual.losses !== losses
      || actual.goalsFor !== goalsFor
      || actual.goalsAgainst !== goalsAgainst
  }).length
  return { matches: season.matches.length, clubs: season.teamIds.length, mismatchedClubs, standingsVerified: true }
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
  const pointsDistribution = new PointsDistributionAccumulator(currentClubs.map(({ id }) => id), simulations)
  const featureBacktest = runFeatureBacktest()

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const season = simulateSeason(random, currentClubs, remainingFixtures, expectedGoals, initialHeadToHead)
    for (const club of season.table) {
      const counts = probabilityCounts.get(club.id)!
      if (club.position === 1) counts.title += 1
      if (isPositionInZone(club.position, ZONES.libertadores)) counts.libertadores += 1
      if (isPositionInZone(club.position, ZONES.sudamericana)) counts.sudamericana += 1
      if (club.position >= ZONES.relegation.from) counts.relegation += 1
      const outcome = getOutcome(club.position)
      pointCurveAccumulator.add({ simulation, club: club.id, points: club.points, position: club.position })
      pointsDistribution.add(club.id, club.points)
      const pointCounts = pointAccumulator.outcomeCounts[outcome]!
      pointCounts.set(club.points, (pointCounts.get(club.points) ?? 0) + 1)
    }
  }

  const pointsStats = pointsDistribution.build()

  return {
    simulations,
    seed,
    clubProbabilities: currentClubs.map((club) => {
      const counts = probabilityCounts.get(club.id)!
      const titleInterval = probabilityWithInterval(counts.title, simulations)
      const libertadoresInterval = probabilityWithInterval(counts.libertadores, simulations)
      const sudamericanaInterval = probabilityWithInterval(counts.sudamericana, simulations)
      const relegationInterval = probabilityWithInterval(counts.relegation, simulations)
      return {
        id: club.id,
        club: club.club,
        currentPosition: club.position,
        currentPoints: club.points,
        title: titleInterval.probability,
        libertadores: libertadoresInterval.probability,
        sudamericana: sudamericanaInterval.probability,
        relegation: relegationInterval.probability,
        titleInterval,
        libertadoresInterval,
        sudamericanaInterval,
        relegationInterval,
        pointsStats: pointsStats.get(club.id)!,
      }
    }),
    pointsAnalysis: analysisFromAccumulator(pointAccumulator),
    pointCurve: pointCurveAccumulator.build(),
    leagueAverageGoals: fullHistoryGoalAverages,
    trainingGoalAverages: historicalGoalAverages(productionTrainingMatches),
    backtest: runTemporalBacktest(),
    featureBacktest,
  }
}
