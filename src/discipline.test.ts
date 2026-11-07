import { describe, expect, it } from 'vitest'
import { disciplineTable, disciplineTiebreak } from './discipline'
import type { AdvancedMatchRecord } from './advancedStats2026'

const clubIds = ['a', 'b', 'c', 'd']
const remaining = [
  { home: 'a', away: 'b' },
  { home: 'c', away: 'd' },
  { home: 'a', away: 'c' },
]

function record(overrides: Partial<AdvancedMatchRecord>): AdvancedMatchRecord {
  return {
    gameId: 1,
    round: 1,
    home: 'a',
    away: 'b',
    homeScore: 1,
    awayScore: 0,
    xgHome: null,
    xgAway: null,
    yellowHome: 0,
    yellowAway: 0,
    redHome: 0,
    redAway: 0,
    ...overrides,
  }
}

describe('disciplineTable', () => {
  it('agrega cartões por clube e projeta pela taxa × jogos restantes', () => {
    const matches = [
      record({ gameId: 1, yellowHome: 3, redHome: 1, yellowAway: 2 }), // a 3Y 1R · b 2Y
      record({ gameId: 2, home: 'c', away: 'd', yellowHome: 1, yellowAway: 4 }), // c 1Y · d 4Y
      record({ gameId: 3, home: 'a', away: 'c', yellowHome: 1, redAway: 1 }), // a +1Y · c +1R
    ]
    const table = disciplineTable(matches, remaining, clubIds)
    const a = table.get('a')!
    // a: 4 amarelos em 2 jogos → taxa 2/jogo × 2 restantes + 4 = 8
    expect(a.yellows).toBe(4)
    expect(a.reds).toBe(1)
    expect(a.matchesCovered).toBe(2)
    expect(a.remaining).toBe(2)
    expect(a.projectedYellows).toBeCloseTo(4 + 2 * 2)
    expect(a.projectedReds).toBeCloseTo(1 + 0.5 * 2)
    const d = table.get('d')!
    expect(d.remaining).toBe(1)
    expect(d.projectedYellows).toBeCloseTo(4 + 4 * 1)
    // Clube sem nenhum jogo na fonte: taxas 0, sem NaN
    const ghost = table.get('x')
    expect(ghost).toBeUndefined()
  })

  it('clubes sem cobertura têm projeção 0, sem NaN', () => {
    const table = disciplineTable([], remaining, clubIds)
    const a = table.get('a')!
    expect(a.projectedYellows).toBe(0)
    expect(a.projectedReds).toBe(0)
    expect(Number.isFinite(a.yellowRate)).toBe(true)
  })
})

describe('disciplineTiebreak (Art. 15, itens 5 e 6)', () => {
  const matches = [
    record({ gameId: 1, yellowHome: 2, redHome: 1, yellowAway: 3 }), // a 2Y 1R · b 3Y 0R
    record({ gameId: 2, home: 'c', away: 'd', yellowHome: 3, yellowAway: 2, redAway: 1 }), // c 3Y 0R · d 2Y 1R
    record({ gameId: 3, home: 'c', away: 'a', yellowHome: 1, yellowAway: 2 }), // c 4Y · a 4Y
  ]
  const table = disciplineTable(matches, remaining, clubIds)

  it('menor número de vermelhos projetados decide primeiro (item 5)', () => {
    // b (0 vermelhos) à frente de a (1 vermelho) → negativo para b
    expect(disciplineTiebreak(table, 'b', 'a')).toBeLessThan(0)
    expect(disciplineTiebreak(table, 'a', 'b')).toBeGreaterThan(0)
  })

  it('empate em vermelhos cai para amarelos projetados (item 6)', () => {
    // c e a têm 0 vermelhos; a tem menos amarelos (4 = 2+2 vs c 4 = 3+1)…
    // taxas: a 4/2=2.0 × 2 restantes = 4+4=8; c 4/2=2.0 × 1 restante = 4+2=6
    expect(disciplineTiebreak(table, 'c', 'a')).toBeLessThan(0)
  })

  it('iguais em ambos os cartões devolve 0 (queda para o sorteio no chamador)', () => {
    const even = disciplineTable([], remaining, clubIds)
    expect(disciplineTiebreak(even, 'a', 'b')).toBe(0)
  })

  it('clube ausente na tabela não lança', () => {
    expect(disciplineTiebreak(table, 'a', 'fantasma')).toBe(0)
  })
})
