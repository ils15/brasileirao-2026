import { wilsonInterval } from './pointCurve'

/**
 * Estatísticas de pontos finais por clube nas simulações Monte Carlo e
 * intervalos de confiança das probabilidades por zona.
 *
 * Medidas de tendência e dispersão (auditoria: o painel exibia apenas a
 * média implícita das probabilidades, sem mediana, percentis ou desvio —
 * insuficiente quando a dispersão é alta, como na disputa por vagas).
 * Percentis usam a definição nearest-rank: o p-ésimo percentil é o
 * ⌈p/100·n⌉-ésimo menor valor da amostra ordenada.
 */
export interface PointsStats {
  samples: number
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  p10: number
  p25: number
  p75: number
  p90: number
}

export interface ProbabilityInterval {
  probability: number
  lower95: number
  upper95: number
}

export function nearestRankPercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) throw new Error('Percentil exige uma amostra não vazia.')
  if (percentile < 0 || percentile > 100) throw new Error('Percentil deve estar entre 0 e 100.')
  const rank = Math.max(1, Math.ceil((percentile / 100) * sortedValues.length))
  return sortedValues[rank - 1]!
}

export function summarizePoints(values: readonly number[]): PointsStats {
  if (values.length === 0) throw new Error('Resumo de pontos exige uma amostra não vazia.')
  const sorted = [...values].sort((left, right) => left - right)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  const mean = total / sorted.length
  const squaredDifferenceSum = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  return {
    samples: sorted.length,
    mean,
    median: nearestRankPercentile(sorted, 50),
    stdDev: Math.sqrt(squaredDifferenceSum / sorted.length),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p10: nearestRankPercentile(sorted, 10),
    p25: nearestRankPercentile(sorted, 25),
    p75: nearestRankPercentile(sorted, 75),
    p90: nearestRankPercentile(sorted, 90),
  }
}

export function probabilityWithInterval(successes: number, samples: number): ProbabilityInterval {
  if (samples <= 0) return { probability: 0, lower95: 0, upper95: 1 }
  const probability = successes / samples
  const [lower95, upper95] = wilsonInterval(probability, samples)
  return { probability, lower95, upper95 }
}

/**
 * Acumula os pontos finais de cada clube por simulação e devolve o resumo
 * estatístico por clube ao final.
 */
export class PointsDistributionAccumulator {
  private readonly samples = new Map<string, number[]>()
  private added = 0

  constructor(clubIds: readonly string[], private readonly expectedSamples: number) {
    for (const id of clubIds) this.samples.set(id, [])
  }

  add(clubId: string, points: number): void {
    const clubSamples = this.samples.get(clubId)
    if (!clubSamples) return
    clubSamples.push(points)
    this.added += 1
  }

  build(): Map<string, PointsStats> {
    const clubCount = this.samples.size
    if (clubCount === 0) return new Map()
    // Uma simulação que não gerou amostras de um clube indica bug no loop
    // externo; falhar aqui é melhor do que publicar estatística silenciosamente vazia.
    const expectedPerClub = this.added / clubCount
    if (!Number.isInteger(expectedPerClub) || expectedPerClub !== this.expectedSamples) {
      throw new Error(`Amostras incompletas: ${this.added} lançamentos em ${clubCount} clubes (esperadas ${this.expectedSamples} por clube).`)
    }
    const summary = new Map<string, PointsStats>()
    for (const [id, values] of this.samples) {
      if (values.length !== expectedPerClub) {
        throw new Error(`Amostras incompletas para ${id}: ${values.length} de ${expectedPerClub} esperadas.`)
      }
      summary.set(id, summarizePoints(values))
    }
    return summary
  }
}
