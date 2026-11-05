import { describe, expect, it } from 'vitest'
import { nearestRankPercentile, PointsDistributionAccumulator, probabilityWithInterval, summarizePoints } from './pointsDistribution'

describe('resumo estatístico de pontos finais', () => {
  it('calcula mediana, percentis nearest-rank, média e desvio em amostra ímpar', () => {
    // 1..9 ordenado: média 5, desvio 0 (para 5,6,7... não) — usar valores explícitos.
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    const stats = summarizePoints(values)
    expect(stats.samples).toBe(9)
    expect(stats.mean).toBe(50)
    expect(stats.median).toBe(50)
    expect(stats.p10).toBe(10) // ⌈0,1·9⌉ = 1º menor
    expect(stats.p25).toBe(30) // ⌈0,25·9⌉ = 3º menor
    expect(stats.p75).toBe(70) // ⌈0,75·9⌉ = 7º menor
    expect(stats.p90).toBe(90) // ⌈0,9·9⌉ = 9º menor
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(90)
    const variance = values.reduce((sum, value) => sum + (value - 50) ** 2, 0) / values.length
    expect(stats.stdDev).toBeCloseTo(Math.sqrt(variance), 12)
  })

  it('ordena internamente e aceita amostra com valores repetidos', () => {
    const stats = summarizePoints([70, 70, 70, 70])
    expect(stats.mean).toBe(70)
    expect(stats.median).toBe(70)
    expect(stats.stdDev).toBe(0)
    expect(stats.min).toBe(stats.max)
  })

  it('rejeita amostra vazia e percentil fora do intervalo', () => {
    expect(() => summarizePoints([])).toThrow('não vazia')
    expect(() => nearestRankPercentile([1, 2, 3], 101)).toThrow('entre 0 e 100')
    expect(() => nearestRankPercentile([1, 2, 3], -1)).toThrow('entre 0 e 100')
  })

  it('acumula por clube e valida integridade das amostras', () => {
    const accumulator = new PointsDistributionAccumulator(['a', 'b'], 3)
    accumulator.add('a', 10)
    accumulator.add('b', 20)
    accumulator.add('a', 30)
    accumulator.add('b', 40)
    accumulator.add('a', 50)
    accumulator.add('b', 60)
    const summary = accumulator.build()
    expect(summary.get('a')).toEqual(summarizePoints([10, 30, 50]))
    expect(summary.get('b')).toEqual(summarizePoints([20, 40, 60]))
  })

  it('falha quando um clube recebe menos amostras que os demais', () => {
    const accumulator = new PointsDistributionAccumulator(['a', 'b', 'c'], 1)
    accumulator.add('a', 10)
    accumulator.add('a', 30)
    accumulator.add('b', 20)
    // 3 lançamentos em 3 clubes = 1 por clube (checagem geral passa),
    // mas "a" tem 2 amostras — a checagem por clube precisa falhar.
    expect(() => accumulator.build()).toThrow('incompletas para a')
  })

  it('ignora clubes desconhecidos no acumulador', () => {
    const accumulator = new PointsDistributionAccumulator(['a'], 1)
    accumulator.add('desconhecido', 99)
    accumulator.add('a', 5)
    expect(accumulator.build().get('a')?.samples).toBe(1)
  })

  it('devolve intervalo Wilson contendo a probabilidade com denom zero guardado', () => {
    const withSamples = probabilityWithInterval(160, 200)
    expect(withSamples.probability).toBeCloseTo(0.8, 12)
    expect(withSamples.lower95).toBeLessThan(0.8)
    expect(withSamples.upper95).toBeGreaterThan(0.8)
    expect(withSamples.lower95).toBeGreaterThan(0.7)
    expect(withSamples.upper95).toBeLessThan(0.9)

    const zero = probabilityWithInterval(0, 0)
    expect(zero).toEqual({ probability: 0, lower95: 0, upper95: 1 })

    const extreme = probabilityWithInterval(0, 100)
    expect(extreme.probability).toBe(0)
    expect(extreme.lower95).toBe(0)
    expect(extreme.upper95).toBeGreaterThan(0)
  })
})
