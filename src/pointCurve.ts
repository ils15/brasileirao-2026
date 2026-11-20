import { MC_CI_Z, POINT_CURVE_LOW_SAMPLE_WIDTH, ZONES } from './projectionConfig'

export type PointCurveOutcome = 'title' | 'libertadores' | 'sudamericana' | 'middle' | 'relegation'

/**
 * Fronteiras da curva de pontos. As zonas efetivas vêm de
 * `resolveLibertadoresZones` (linha G-5 a G-9); o default preserva o baseline
 * G-6 usado pelos testes e por chamadas legadas.
 */
export interface PointCurveZones {
  readonly libertadoresTo: number
  readonly sudamericanaTo: number
}

const DEFAULT_POINT_CURVE_ZONES: PointCurveZones = {
  libertadoresTo: ZONES.libertadores.to,
  sudamericanaTo: ZONES.sudamericana.to,
}

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

export interface PointCurveAggregateRow {
  points: number
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
  inclusiveLibertadores: PointCurveAggregateRow[]
  simulationCount: number
}

/**
 * Agregado bruto e independente de cenário: para cada pontuação final, quantas
 * simulações produziram cada combinação de posições (máscara de 20 bits, bit 0
 * = 1º). O desfecho de cada posição depende das zonas do cenário ativo, então
 * a curva é resolvida na leitura — nunca assada no resultado do Monte Carlo.
 */
export interface PointOutcomeCurveSnapshot {
  readonly simulationCount: number
  /** Pontuações distintas, em ordem crescente. */
  readonly points: readonly number[]
  /** Máscaras de posição observadas para cada pontuação. */
  readonly masks: ReadonlyArray<readonly number[]>
  /** Quantas simulações produziram a máscara correspondente. */
  readonly counts: ReadonlyArray<readonly number[]>
}

/** Histograma `pontuação → máscara de posições → simulações`. */
type MaskHistogram = Map<number, Map<number, number>>

const POSITION_COUNT = 20
const outcomes: readonly PointCurveOutcome[] = ['title', 'libertadores', 'sudamericana', 'middle', 'relegation']

function maskFor(from: number, to: number): number {
  let mask = 0
  for (let position = from; position <= to; position += 1) mask |= 1 << (position - 1)
  return mask
}

function zoneMasks(zones: PointCurveZones): Record<PointCurveOutcome, number> & { inclusiveLibertadores: number } {
  return {
    title: maskFor(1, 1),
    libertadores: maskFor(2, zones.libertadoresTo),
    sudamericana: maskFor(zones.libertadoresTo + 1, zones.sudamericanaTo),
    middle: maskFor(zones.sudamericanaTo + 1, ZONES.middle.to),
    relegation: maskFor(ZONES.relegation.from, ZONES.relegation.to),
    inclusiveLibertadores: maskFor(1, zones.libertadoresTo),
  }
}

function popcount(mask: number): number {
  let remaining = mask
  let count = 0
  while (remaining !== 0) {
    count += remaining & 1
    remaining >>>= 1
  }
  return count
}

function countSuccesses(distribution: ReadonlyMap<number, number>, selection: number): number {
  let successes = 0
  for (const [mask, count] of distribution) successes += popcount(mask & selection) * count
  return successes
}

function squaredInfluence(
  distribution: ReadonlyMap<number, number>,
  probability: number,
  selection: number,
): number {
  let total = 0
  for (const [mask, count] of distribution) {
    const successes = popcount(mask & selection)
    total += count * (successes - probability * popcount(mask)) ** 2
  }
  return total
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
  probability: number,
  denominator: number,
  squaredInfluenceSum: number,
  simulationCount: number,
  squaredDenominators: number,
): [number, number] {
  if (simulationCount < 2 || denominator === 0) return [0, 1]

  const variance = (simulationCount / (simulationCount - 1)) * squaredInfluenceSum / (denominator ** 2)
  if (variance === 0) {
    const effectiveCount = squaredDenominators === 0 ? 0 : denominator ** 2 / squaredDenominators
    return wilsonInterval(probability, effectiveCount)
  }
  const margin = MC_CI_Z * Math.sqrt(variance)
  return [Math.max(0, probability - margin), Math.min(1, probability + margin)]
}

function estimate(
  points: number,
  successes: number,
  denominator: number,
  squaredInfluenceSum: number,
  clusterCount: number,
  squaredDenominators: number,
  simulationCount: number,
): PointCurveAggregateRow {
  const probability = successes / denominator
  const [lower95, upper95] = clusterInterval(
    probability,
    denominator,
    squaredInfluenceSum,
    simulationCount,
    squaredDenominators,
  )
  return {
    points,
    successes,
    denominator,
    probability,
    lower95,
    upper95,
    clusterCount,
    lowSample: upper95 - lower95 >= POINT_CURVE_LOW_SAMPLE_WIDTH,
  }
}

function buildFromHistogram(
  histogram: MaskHistogram,
  simulationCount: number,
  zones: PointCurveZones,
): PointOutcomeCurve {
  if (simulationCount <= 0 || histogram.size === 0) {
    return { rows: [], inclusiveLibertadores: [], simulationCount: 0 }
  }

  const masks = zoneMasks(zones)
  const rows: PointCurveRow[] = []
  const inclusiveLibertadores: PointCurveAggregateRow[] = []
  for (const pointsValue of [...histogram.keys()].sort((left, right) => left - right)) {
    const distribution = histogram.get(pointsValue)!
    let denominator = 0
    let squaredDenominators = 0
    let clusterCount = 0
    for (const [mask, count] of distribution) {
      const observations = popcount(mask)
      denominator += observations * count
      squaredDenominators += observations ** 2 * count
      clusterCount += count
    }
    if (denominator === 0) continue
    for (const outcome of outcomes) {
      const successes = countSuccesses(distribution, masks[outcome])
      if (successes === 0) continue
      rows.push({
        ...estimate(
          pointsValue,
          successes,
          denominator,
          squaredInfluence(distribution, successes / denominator, masks[outcome]),
          clusterCount,
          squaredDenominators,
          simulationCount,
        ),
        outcome,
      })
    }
    const inclusiveSuccesses = countSuccesses(distribution, masks.inclusiveLibertadores)
    inclusiveLibertadores.push(estimate(
      pointsValue,
      inclusiveSuccesses,
      denominator,
      squaredInfluence(distribution, inclusiveSuccesses / denominator, masks.inclusiveLibertadores),
      clusterCount,
      squaredDenominators,
      simulationCount,
    ))
  }
  return { rows, inclusiveLibertadores, simulationCount }
}

/**
 * Acumula amostras clube×simulação por **posição final**. A zona só é aplicada
 * em `build(zones)`: o mesmo agregado alimenta qualquer um dos 16 cenários.
 *
 * As amostras precisam chegar em ordem não decrescente de `simulation` — cada
 * simulação tem no máximo um clube por posição, então a máscara de posições
 * de uma pontuação identifica a simulação sem guardar 500.000 arrays.
 */
export class PointOutcomeCurveAccumulator {
  private readonly histogram: MaskHistogram = new Map()
  private readonly pending = new Map<number, number>()
  private pendingSimulation: number | null = null

  constructor(private readonly simulationCount: number) {}

  add(sample: PointCurveSample): void {
    if (!Number.isInteger(sample.simulation) || sample.simulation < 0 || sample.simulation >= this.simulationCount) return
    if (!Number.isInteger(sample.position) || sample.position < 1 || sample.position > POSITION_COUNT) return
    if (this.pendingSimulation === null) {
      this.pendingSimulation = sample.simulation
    } else if (sample.simulation !== this.pendingSimulation) {
      if (sample.simulation < this.pendingSimulation) {
        throw new Error('Amostras da curva de pontos precisam vir em ordem de simulação.')
      }
      this.flush()
      this.pendingSimulation = sample.simulation
    }
    const mask = (this.pending.get(sample.points) ?? 0) | (1 << (sample.position - 1))
    this.pending.set(sample.points, mask)
  }

  private flush(): void {
    for (const [points, mask] of this.pending) {
      let distribution = this.histogram.get(points)
      if (!distribution) {
        distribution = new Map()
        this.histogram.set(points, distribution)
      }
      distribution.set(mask, (distribution.get(mask) ?? 0) + 1)
    }
    this.pending.clear()
  }

  /** Agregado bruto transportável: pequeno e independente de cenário. */
  snapshot(): PointOutcomeCurveSnapshot {
    this.flush()
    const points = [...this.histogram.keys()].sort((left, right) => left - right)
    return {
      simulationCount: this.simulationCount,
      points,
      masks: points.map((pointsValue) => [...this.histogram.get(pointsValue)!.keys()]),
      counts: points.map((pointsValue) => [...this.histogram.get(pointsValue)!.values()]),
    }
  }

  build(zones: PointCurveZones = DEFAULT_POINT_CURVE_ZONES): PointOutcomeCurve {
    this.flush()
    return buildFromHistogram(this.histogram, this.simulationCount, zones)
  }
}

/** Deriva a curva de um cenário a partir do agregado bruto, sem re-simular. */
export function buildPointOutcomeCurveFromSnapshot(
  snapshot: PointOutcomeCurveSnapshot,
  zones: PointCurveZones = DEFAULT_POINT_CURVE_ZONES,
): PointOutcomeCurve {
  if (snapshot.simulationCount <= 0 || snapshot.points.length === 0) {
    return { rows: [], inclusiveLibertadores: [], simulationCount: 0 }
  }
  const histogram: MaskHistogram = new Map()
  snapshot.points.forEach((points, index) => {
    const distribution = new Map<number, number>()
    const masks = snapshot.masks[index] ?? []
    const counts = snapshot.counts[index] ?? []
    masks.forEach((mask, maskIndex) => distribution.set(mask, counts[maskIndex] ?? 0))
    histogram.set(points, distribution)
  })
  return buildFromHistogram(histogram, snapshot.simulationCount, zones)
}

export function buildPointOutcomeCurve(
  samples: readonly PointCurveSample[],
  simulationCount: number,
  zones: PointCurveZones = DEFAULT_POINT_CURVE_ZONES,
): PointOutcomeCurve {
  if (simulationCount <= 0 || samples.length === 0) {
    return { rows: [], inclusiveLibertadores: [], simulationCount: 0 }
  }
  const accumulator = new PointOutcomeCurveAccumulator(simulationCount)
  for (const sample of samples) accumulator.add(sample)
  return accumulator.build(zones)
}
