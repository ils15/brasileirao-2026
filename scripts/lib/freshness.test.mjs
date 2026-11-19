import { describe, expect, it } from 'vitest'
import { isStale, stalenessHours } from './freshness.mjs'

// data-fixa: fixture sintética — instante inventado, não o corte vigente (esse
// vem de src/sourceMetadata.ts). Datas derivadas por aritmética para o teste
// não depender do relógio nem do pacote.
const CUTOFF = '2026-01-05T12:00:00Z'
const CUTOFF_MS = Date.parse(CUTOFF)
const HOUR_MS = 3_600_000
const at = (offsetHours) => new Date(CUTOFF_MS + offsetHours * HOUR_MS).toISOString()

describe('stalenessHours', () => {
  it('agora anterior ao corte devolve horas negativas (relógio adiantado, não defasagem)', () => {
    const hours = stalenessHours({ cutoffUtc: CUTOFF, now: at(-1) })
    expect(hours).toBeCloseTo(-1, 6)
    expect(isStale({ cutoffUtc: CUTOFF, now: at(-1), maxAgeHours: 24 })).toBe(false)
  })

  it('calcula horas decimais entre corte e agora', () => {
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: at(3) })).toBeCloseTo(3, 6)
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: at(1.5) })).toBeCloseTo(1.5, 6)
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: at(130.9) })).toBeCloseTo(130.9, 6)
  })

  it('aceita Date e epoch-ms além de string ISO', () => {
    expect(stalenessHours({ cutoffUtc: new Date(CUTOFF_MS), now: at(1.5) })).toBeCloseTo(1.5, 6)
    expect(stalenessHours({ cutoffUtc: CUTOFF_MS, now: CUTOFF_MS + 90 * 60 * 1000 })).toBeCloseTo(1.5, 6)
  })

  it('data inválida devolve null (primitiva tolerante)', () => {
    expect(stalenessHours({ cutoffUtc: 'ontem', now: at(1) })).toBeNull()
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: 'não é data' })).toBeNull()
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: 'Invalid Date' })).toBeNull()
    expect(stalenessHours({ cutoffUtc: undefined, now: at(1) })).toBeNull()
    expect(stalenessHours({ cutoffUtc: null, now: at(1) })).toBeNull()
    expect(stalenessHours({ cutoffUtc: Number.NaN, now: at(1) })).toBeNull()
  })
})

describe('isStale', () => {
  it('exatamente no limiar já conta como defasado (limite inclusivo)', () => {
    const now = at(24)
    expect(stalenessHours({ cutoffUtc: CUTOFF, now })).toBeCloseTo(24, 6)
    expect(isStale({ cutoffUtc: CUTOFF, now, maxAgeHours: 24 })).toBe(true)
  })

  it('logo abaixo do limiar é fresco', () => {
    const now = at(24 - 1 / 3600) // 23h59m59s
    expect(isStale({ cutoffUtc: CUTOFF, now, maxAgeHours: 24 })).toBe(false)
  })

  it('acima do limiar é defasado', () => {
    expect(isStale({ cutoffUtc: CUTOFF, now: at(25), maxAgeHours: 24 })).toBe(true)
    expect(isStale({ cutoffUtc: CUTOFF, now: at(130.9), maxAgeHours: 24 })).toBe(true)
  })

  it('respeita maxAgeHours como parâmetro, não como constante', () => {
    expect(isStale({ cutoffUtc: CUTOFF, now: at(24), maxAgeHours: 24.0001 })).toBe(false)
    expect(isStale({ cutoffUtc: CUTOFF, now: at(24), maxAgeHours: 12 })).toBe(true)
  })

  it('data inválida lança — nunca vira "fresco"', () => {
    expect(() => isStale({ cutoffUtc: 'ontem', now: at(1), maxAgeHours: 24 }))
      .toThrow(/corte analítico inválido/)
    expect(() => isStale({ cutoffUtc: CUTOFF, now: 'não é data', maxAgeHours: 24 }))
      .toThrow(/corte analítico inválido/)
  })

  it('corte ausente lança', () => {
    expect(() => isStale({ now: at(1), maxAgeHours: 24 })).toThrow(/corte analítico inválido/)
    expect(() => isStale({ cutoffUtc: '', now: at(1), maxAgeHours: 24 })).toThrow(/corte analítico inválido/)
    expect(() => isStale({ cutoffUtc: null, now: at(1), maxAgeHours: 24 })).toThrow(/corte analítico inválido/)
  })

  it('maxAgeHours inválido lança', () => {
    for (const maxAgeHours of [-1, Number.NaN, Number.POSITIVE_INFINITY, '24']) {
      expect(() => isStale({ cutoffUtc: CUTOFF, now: at(1), maxAgeHours })).toThrow(/maxAgeHours inválido/)
    }
  })
})
