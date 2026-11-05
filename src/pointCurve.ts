import { MC_CI_Z, POINT_CURVE_LOW_SAMPLE_WIDTH, ZONES } from './projectionConfig'

export type PointCurveOutcome = 'title' | 'libertadores' | 'sudamericana' | 'middle' | 'relegation'

export interface PointCurveSample {
  simulation: number
  club: string
  points: number
  position: number
}

export interface PointCurveRow {
  points: number
  outcome: PointCurveOutcome
  successes: number
  denominator: number
  probability: number
  lower95: number
  upper95: number
  clusterCount: number
  lowSample: boolean
}

export interface PointOutcomeCurve {
  rows: PointCurveRow[]
  simulationCount: number
}

interface OutcomeCount {
  successes: number
  clusterSuccesses: Uint8Array
}

interface PointCount {
  denominator: number
  clusterDenominators: Uint8Array
  outcomes: Record<PointCurveOutcome, OutcomeCount>
}

const outcomes: readonly PointCurveOutcome[] = ['title', 'libertadores', 'sudamericana', 'middle', 'relegation']

function outcomeAt(position: number): PointCurveOutcome {
  if (position === 1) return 'title'
  if (position <= ZONES.libertadores.to) return 'libertadores'
  if (position <= ZONES.sudamericana.to) return 'sudamericana'
  if (position <= ZONES.middle.to) return 'middle'
  return 'relegation'
}

function createPointCount(simulationCount: number): PointCount {
  const createOutcomeCount = (): OutcomeCount => ({ successes: 0, clusterSuccesses: new Uint8Array(simulationCount) })
  return {
    denominator: 0,
    clusterDenominators: new Uint8Array(simulationCount),
    outcomes: {
      title: createOutcomeCount(),
      libertadores: createOutcomeCount(),
      sudamericana: createOutcomeCount(),
      middle: createOutcomeCount(),
      relegation: createOutcomeCount(),
    },
  }
}

function effectiveClusterCount(point: PointCount): number {
  const sumSquares = point.clusterDenominators.reduce((sum, count) => sum + count ** 2, 0)
  return sumSquares === 0 ? 0 : point.denominator ** 2 / sumSquares
}

export function wilsonInterval(probability: number, effectiveCount: number): [number, number] {
  if (effectiveCount === 0) return [0, 1]
  const zSquared = MC_CI_Z ** 2
  const denominator = 1 + zSquared / effectiveCount
  const center = (probability + zSquared / (2 * effectiveCount)) / denominator
  const halfWidth = MC_CI_Z * Math.sqrt((probability * (1 - probability) / effectiveCount) + zSquared / (4 * effectiveCount ** 2)) / denominator
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)]
}

function clusterInterval(
  count: OutcomeCount,
  point: PointCount,
  probability: number,
  simulationCount: number,
): [number, number] {
  if (simulationCount < 2 || point.denominator === 0) return [0, 1]

  let squaredInfluence = 0
  for (let simulation = 0; simulation < simulationCount; simulation += 1) {
    const successes = count.clusterSuccesses[simulation]!
    const observations = point.clusterDenominators[simulation]!
    squaredInfluence += (successes - probability * observations) ** 2
  }
  const variance = (simulationCount / (simulationCount - 1)) * squaredInfluence / (point.denominator ** 2)
  if (variance === 0) return wilsonInterval(probability, effectiveClusterCount(point))
  const margin = MC_CI_Z * Math.sqrt(variance)
  return [Math.max(0, probability - margin), Math.min(1, probability + margin)]
}

export class PointOutcomeCurveAccumulator {
  private readonly points = new Map<number, PointCount>()

  constructor(private readonly simulationCount: number) {}

  add(sample: PointCurveSample): void {
    if (!Number.isInteger(sample.simulation) || sample.simulation < 0 || sample.simulation >= this.simulationCount) return
    const pointCount = this.points.get(sample.points) ?? createPointCount(this.simulationCount)
    pointCount.denominator += 1
    pointCount.clusterDenominators[sample.simulation] = pointCount.clusterDenominators[sample.simulation]! + 1
    const outcomeCount = pointCount.outcomes[outcomeAt(sample.position)]
    outcomeCount.successes += 1
    outcomeCount.clusterSuccesses[sample.simulation] = outcomeCount.clusterSuccesses[sample.simulation]! + 1
    this.points.set(sample.points, pointCount)
  }

  build(): PointOutcomeCurve {
    if (this.simulationCount <= 0 || this.points.size === 0) return { rows: [], simulationCount: 0 }

  const rows: PointCurveRow[] = []
  for (const [pointsValue, pointCount] of [...this.points.entries()].sort(([left], [right]) => left - right)) {
    if (pointCount.denominator === 0) continue
    for (const outcome of outcomes) {
      const count = pointCount.outcomes[outcome]
      if (count.successes === 0) continue
      const probability = count.successes / pointCount.denominator
      const [lower95, upper95] = clusterInterval(count, pointCount, probability, this.simulationCount)
      rows.push({
        points: pointsValue,
        outcome,
        successes: count.successes,
        denominator: pointCount.denominator,
        probability,
        lower95,
        upper95,
        clusterCount: pointCount.clusterDenominators.reduce((sum, count) => sum + Number(count > 0), 0),
        lowSample: upper95 - lower95 >= POINT_CURVE_LOW_SAMPLE_WIDTH,
      })
    }
  }
    return { rows, simulationCount: this.simulationCount }
  }
}

export function buildPointOutcomeCurve(samples: readonly PointCurveSample[], simulationCount: number): PointOutcomeCurve {
  if (simulationCount <= 0 || samples.length === 0) return { rows: [], simulationCount: 0 }
  const accumulator = new PointOutcomeCurveAccumulator(simulationCount)
  for (const sample of samples) accumulator.add(sample)
  return accumulator.build()
}
