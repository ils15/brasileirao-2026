import {
  buildPointOutcomeCurveFromSnapshot,
  type PointCurveZones,
  type PointOutcomeCurveSnapshot,
} from './pointCurve'
import { probabilityWithInterval, type PointsStats } from './pointsDistribution'
import type { FeatureBacktest } from './modelBacktest'
import {
  LEGACY_LIBERTADORES_SCENARIO,
  RESULT_GROUPS,
  ZONES,
  resolveLibertadoresZones,
  scenarioFromKey,
  scenarioKeyOf,
  type LibertadoresScenario,
  type LibertadoresScenarioKey,
  type LibertadoresZones,
} from './projectionConfig'
import type {
  BacktestSummary,
  ClubProbability,
  LibertadoresScenarioCount,
  OutcomeDistribution,
  PointsAnalysis,
  ProjectionResult,
} from './projection'

/**
 * Módulo leve de derivação: importa apenas configuração, agregação pura e
 * tipos. NÃO importa `projection.ts` em runtime — assim a main thread deriva o
 * cenário ativo sem carregar o histórico de 9 mil partidas nem o backtest.
 */

type ScenarioZones = LibertadoresZones & { scenarioKey: LibertadoresScenarioKey }

/** As 2^4 combinações de devoluções, resolvidas uma única vez por módulo. */
const SCENARIO_ZONES: readonly ScenarioZones[] = Array.from(
  { length: 16 },
  (_, scenarioKey) => ({ scenarioKey, ...resolveLibertadoresZones(scenarioFromKey(scenarioKey)) }),
)

/** Histograma de posições 1–20 (índice 0 sem uso); base das 16 combinações e das zonas. */
export function createPositionHistogram(): number[] {
  return new Array<number>(21).fill(0)
}

export function scenarioCountsFrom(positions: readonly number[]): LibertadoresScenarioCount[] {
  return SCENARIO_ZONES.map(({ scenarioKey, directTo, libertadoresTo }) => {
    let libertadores = 0
    let direct = 0
    for (let position = 1; position <= libertadoresTo; position += 1) libertadores += positions[position]!
    for (let position = 1; position <= directTo; position += 1) direct += positions[position]!
    return { scenarioKey, libertadoresTo, directTo, libertadores, direct }
  })
}

function positionRangeTotal(positions: readonly number[], from: number, to: number): number {
  let total = 0
  for (let position = from; position <= to; position += 1) total += positions[position]!
  return total
}

/** Histograma bruto de um clube: só a posição final, sem desfecho de cenário. */
export interface RawClubProjection {
  id: string
  club: string
  currentPosition: number
  currentPoints: number
  positionCounts: number[]
  pointsStats: PointsStats
}

/** Distribuição de pontos finais por posição — bruta, independente de cenário. */
export interface PointsPositionCounts {
  points: number
  /** Índice 0 sem uso; 1..20 = clubes que terminaram naquela posição. */
  positionCounts: number[]
}

/**
 * Resultado bruto da única execução Monte Carlo do worker. Nada aqui depende
 * do cenário ativo: trocar de cenário é `deriveProjectionResult`, sem re-simular.
 */
export interface RawProjectionResult {
  simulations: number
  seed: number
  clubs: RawClubProjection[]
  pointCurve: PointOutcomeCurveSnapshot
  pointsByPosition: PointsPositionCounts[]
  leagueAverageGoals: { home: number; away: number }
  trainingGoalAverages: { home: number; away: number }
  backtest: BacktestSummary
  featureBacktest: FeatureBacktest
}

/** Índice em `RESULT_GROUPS` do desfecho de uma posição final. */
function outcomeIndexAt(position: number, zones: PointCurveZones): number {
  if (position === 1) return 0
  if (position <= zones.libertadoresTo) return 1
  if (position <= zones.sudamericanaTo) return 2
  if (position <= ZONES.middle.to) return 3
  return 4
}

/**
 * Agrupa as contagens brutas por posição nas cinco categorias finais do
 * cenário ativo. O desfecho é derivado aqui — nunca assado na simulação.
 */
export function analysisFromPositionCounts(
  rows: readonly PointsPositionCounts[],
  zones: PointCurveZones,
): PointsAnalysis {
  const countsByGroup = RESULT_GROUPS.map(() => new Map<number, number>())
  const samplesByGroup = RESULT_GROUPS.map(() => 0)
  for (const row of rows) {
    for (let position = 1; position <= 20; position += 1) {
      const count = row.positionCounts[position] ?? 0
      if (count === 0) continue
      const group = outcomeIndexAt(position, zones)
      const pointCounts = countsByGroup[group]!
      pointCounts.set(row.points, (pointCounts.get(row.points) ?? 0) + count)
      samplesByGroup[group] = samplesByGroup[group]! + count
    }
  }
  return {
    distributionByOutcome: RESULT_GROUPS.map(({ id, label }, index): OutcomeDistribution => {
      const samples = samplesByGroup[index]!
      return {
        id,
        label,
        samples,
        points: [...countsByGroup[index]!.entries()]
          .sort(([left], [right]) => left - right)
          .map(([points, count]) => ({ points, count, probability: count / samples })),
      }
    }),
  }
}

export function pointsRows(rows: ReadonlyMap<number, number[]>): PointsPositionCounts[] {
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([points, positionCounts]) => ({ points, positionCounts }))
}

function clubProbabilityFrom(
  raw: RawClubProjection,
  zones: LibertadoresZones,
  activeScenarioKey: LibertadoresScenarioKey,
  simulations: number,
): ClubProbability {
  const positions = raw.positionCounts
  const lineCounts = scenarioCountsFrom(positions)
  const active = lineCounts.find((entry) => entry.scenarioKey === activeScenarioKey)!
  const titleInterval = probabilityWithInterval(positions[1]!, simulations)
  const libertadoresInterval = probabilityWithInterval(active.libertadores, simulations)
  const libertadoresDirectInterval = probabilityWithInterval(active.direct, simulations)
  const sudamericanaInterval = probabilityWithInterval(
    positionRangeTotal(positions, zones.sudamericanaFrom, zones.sudamericanaTo),
    simulations,
  )
  const relegationInterval = probabilityWithInterval(
    positionRangeTotal(positions, ZONES.relegation.from, ZONES.relegation.to),
    simulations,
  )
  return {
    id: raw.id,
    club: raw.club,
    currentPosition: raw.currentPosition,
    currentPoints: raw.currentPoints,
    title: titleInterval.probability,
    libertadores: libertadoresInterval.probability,
    libertadoresDirect: libertadoresDirectInterval.probability,
    sudamericana: sudamericanaInterval.probability,
    relegation: relegationInterval.probability,
    titleInterval,
    libertadoresInterval,
    libertadoresDirectInterval,
    sudamericanaInterval,
    relegationInterval,
    lineCounts,
    positionCounts: positions,
    pointsStats: raw.pointsStats,
  }
}

/**
 * Deriva o `ProjectionResult` público de um resultado bruto e de um cenário.
 * Custo desprezível: somas de histogramas e a curva por máscaras — a única
 * simulação cara já aconteceu em `runProjectionRaw`, no worker.
 */
export function deriveProjectionResult(
  raw: RawProjectionResult,
  scenario: LibertadoresScenario = LEGACY_LIBERTADORES_SCENARIO,
): ProjectionResult {
  const zones = resolveLibertadoresZones(scenario)
  const activeScenarioKey = scenarioKeyOf(scenario)
  return {
    simulations: raw.simulations,
    seed: raw.seed,
    scenario,
    libertadoresZones: zones,
    clubProbabilities: raw.clubs.map((club) => clubProbabilityFrom(club, zones, activeScenarioKey, raw.simulations)),
    pointsAnalysis: analysisFromPositionCounts(raw.pointsByPosition, zones),
    pointCurve: buildPointOutcomeCurveFromSnapshot(raw.pointCurve, zones),
    leagueAverageGoals: raw.leagueAverageGoals,
    trainingGoalAverages: raw.trainingGoalAverages,
    backtest: raw.backtest,
    featureBacktest: raw.featureBacktest,
  }
}
