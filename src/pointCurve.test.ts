import { describe, expect, it } from 'vitest'
import { buildPointOutcomeCurve, type PointCurveSample } from './pointCurve'

describe('curva de resultado por pontos finais', () => {
  it('agrega observações clube×simulação, exibe K/N e preserva simulações como clusters no IC', () => {
    const samples: PointCurveSample[] = [
      { simulation: 0, club: 'A', points: 50, position: 1 },
      { simulation: 0, club: 'B', points: 50, position: 8 },
      { simulation: 1, club: 'C', points: 50, position: 4 },
      { simulation: 1, club: 'D', points: 60, position: 14 },
      { simulation: 2, club: 'E', points: 70, position: 18 },
    ]

    // Mapeamento de 5 destinos: 1º = título; 2º–5º = libertadores; 6º–11º = sudamericana; 12º–16º = middle; 17º–20º = relegation
    const curve = buildPointOutcomeCurve(samples, 3)
    expect(curve.rows.map(({ points, outcome, successes, denominator }) => [points, outcome, successes, denominator])).toEqual([
      [50, 'title', 1, 3],
      [50, 'libertadores', 1, 3],
      [50, 'sudamericana', 1, 3],
      [60, 'middle', 1, 1],
      [70, 'relegation', 1, 1],
    ])
    const titleAt50 = curve.rows.find((row) => row.points === 50 && row.outcome === 'title')!
    expect(titleAt50.probability).toBeCloseTo(1 / 3, 12)
    expect(titleAt50.lower95).toBeLessThanOrEqual(titleAt50.probability)
    expect(titleAt50.upper95).toBeGreaterThanOrEqual(titleAt50.probability)
    expect(titleAt50.clusterCount).toBe(2)
    expect(titleAt50.lowSample).toBe(true)
  })

  it('não estima células sem denominador e omite resultados com K=0', () => {
    const curve = buildPointOutcomeCurve([
      { simulation: 0, club: 'A', points: 45, position: 1 },
      { simulation: 1, club: 'B', points: 50, position: 7 },
    ], 2)

    expect(curve.rows).toHaveLength(2)
    expect(curve.rows.every(({ successes, denominator }) => successes > 0 && denominator > 0)).toBe(true)
    expect(curve.rows.some(({ points }) => points === 46)).toBe(false)
  })

  it('trata uma amostra vazia como não estimável', () => {
    expect(buildPointOutcomeCurve([], 0)).toEqual({ rows: [], simulationCount: 0 })
  })
})
