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

    // Mapeamento de 5 destinos: 1º = título; 2º–6º = libertadores; 7º–12º = sudamericana; 13º–16º = middle; 17º–20º = relegation
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

  it('classifica corretamente as fronteiras entre as zonas finais do cenário G-6', () => {
    const positions = [6, 7, 12, 13, 16, 17]
    const curve = buildPointOutcomeCurve([
      ...positions.map((position, simulation) => ({
        simulation,
        club: `clube-${position}`,
        points: 50 + simulation,
        position,
      })),
    ], positions.length)

    expect(curve.rows.map(({ points, outcome }) => [points, outcome])).toEqual([
      [50, 'libertadores'],
      [51, 'sudamericana'],
      [52, 'sudamericana'],
      [53, 'middle'],
      [54, 'middle'],
      [55, 'relegation'],
    ])
  })

  it('estima Libertadores inclusiva com IC cluster-robusto agregado por simulação', () => {
    const curve = buildPointOutcomeCurve([
      { simulation: 0, club: 'A', points: 50, position: 1 },
      { simulation: 0, club: 'B', points: 50, position: 2 },
      { simulation: 1, club: 'C', points: 50, position: 7 },
      { simulation: 1, club: 'D', points: 50, position: 8 },
      { simulation: 2, club: 'E', points: 50, position: 1 },
      { simulation: 2, club: 'F', points: 50, position: 9 },
      { simulation: 3, club: 'G', points: 50, position: 10 },
      { simulation: 3, club: 'H', points: 50, position: 11 },
    ], 4)

    const inclusive = curve.inclusiveLibertadores.find(({ points }) => points === 50)!
    const probability = 3 / 8
    const margin = 1.96 * Math.sqrt(11 / 192)
    expect(inclusive.successes).toBe(3)
    expect(inclusive.denominator).toBe(8)
    expect(inclusive.probability).toBe(probability)
    expect(inclusive.clusterCount).toBe(4)
    expect(inclusive.lower95).toBe(0)
    expect(inclusive.upper95).toBeCloseTo(probability + margin, 12)
    expect(inclusive.lowSample).toBe(inclusive.upper95 - inclusive.lower95 >= 0.1)
    expect(inclusive.lowSample).toBe(true)
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
    expect(buildPointOutcomeCurve([], 0)).toEqual({ rows: [], inclusiveLibertadores: [], simulationCount: 0 })
  })
})
