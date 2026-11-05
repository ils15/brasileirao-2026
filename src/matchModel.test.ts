import { describe, expect, it } from 'vitest'
import { estimateHeadToHeadAdjustment, type ModelMatch } from './matchModel'

describe('ajuste H2H regularizado por mando', () => {
  it('usa zero quando não há confronto comprovado', () => {
    expect(estimateHeadToHeadAdjustment([], { home: 1.5, away: 1 }, 2026)).toEqual({
      home: 0,
      away: 0,
      effectiveWeight: 0,
    })
  })

  it('encolhe resíduos de confronto para zero e aplica decaimento temporal', () => {
    const recent: ModelMatch = {
      home: 'home', away: 'away', homeGoals: 5, awayGoals: 0,
      kickoff: '2026-01-01T00:00Z', seasonYear: 2026, sourceOrdinal: 1,
    }
    const old: ModelMatch = { ...recent, seasonYear: 2021, sourceOrdinal: 2 }
    const baseline = { home: 1.5, away: 1 }

    const recentAdjustment = estimateHeadToHeadAdjustment([recent], baseline, 2026)
    const oldAdjustment = estimateHeadToHeadAdjustment([old], baseline, 2026)
    expect(recentAdjustment.home).toBe(0.35)
    expect(recentAdjustment.away).toBeCloseTo(-1 / 7, 12)
    expect(oldAdjustment.effectiveWeight).toBeCloseTo(0.25, 12)
    expect(Math.abs(oldAdjustment.home)).toBeLessThan(Math.abs(recentAdjustment.home))
    expect(recentAdjustment.home).toBeLessThanOrEqual(0.35)
  })
})
