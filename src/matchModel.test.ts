import { describe, expect, it } from 'vitest'
import {
  blendExpectedGoals,
  estimateHeadToHeadAdjustment,
  expectedGoalsFromTeamTotals,
  expectedGoalsFromXg,
  historicalGoalAverages,
  poissonResultProbabilities,
  type ModelMatch,
} from './matchModel'

describe('fórmulas de gols esperados e probabilidades', () => {
  it('devolve médias neutras para base vazia (guarda de divisão por zero)', () => {
    expect(historicalGoalAverages([])).toEqual({ home: 1, away: 1 })
  })

  it('calcula força de ataque/defesa com encolhimento em caso numérico conhecido', () => {
    // μ casa = μ fora = 1,4 (2 gols por jogo na base). Times com 2 jogos:
    // casa marcou 4 e sofreu 0; fora marcou 0 e sofreu 4. k = 2.
    // atk_casa = (4 + 2·1,4)/(2+2)/1,4 = 6,8/4/1,4 ≈ 1,2143
    // def_fora = (4 + 2·1,4)/(2+2)/1,4 ≈ 1,2143
    // λ_casa = 1,4 · 1,2143 · 1,2143 ≈ 2,0633
    const averages = { home: 1.4, away: 1.4 }
    const home = { played: 2, goalsFor: 4, goalsAgainst: 0 }
    const away = { played: 2, goalsFor: 0, goalsAgainst: 4 }
    const expected = expectedGoalsFromTeamTotals(home, away, averages, 2)
    expect(expected.home).toBeCloseTo(1.4 * (6.8 / 4 / 1.4) * (6.8 / 4 / 1.4), 12)
    expect(expected.away).toBeCloseTo(1.4 * (2.8 / 4 / 1.4) * (2.8 / 4 / 1.4), 12)
  })

  it('mantém multiplicadores neutros quando não há partidas nem encolhimento', () => {
    const empty = { played: 0, goalsFor: 0, goalsAgainst: 0 }
    const expected = expectedGoalsFromTeamTotals(empty, empty, { home: 1.3, away: 1.1 }, 0)
    expect(expected.home).toBeCloseTo(1.3, 12)
    expect(expected.away).toBeCloseTo(1.1, 12)
  })

  it('normaliza as probabilidades de resultado para somar 1', () => {
    const probabilities = poissonResultProbabilities({ home: 1.8, away: 0.9 })
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
    for (const probability of probabilities) {
      expect(probability).toBeGreaterThanOrEqual(0)
      expect(probability).toBeLessThanOrEqual(1)
    }
    // Time da casa mais forte deve ter probabilidade de vitória maior.
    expect(probabilities[0]).toBeGreaterThan(probabilities[2])
  })
})

describe('blend xG × gols (§18)', () => {
  const goalsExpected = { home: 1.8, away: 0.9 }
  const xgExpected = { home: 1.2, away: 1.4 }

  it('peso 0 devolve o modelo de gols sem transformação', () => {
    expect(blendExpectedGoals(goalsExpected, xgExpected, 0)).toEqual(goalsExpected)
  })

  it('peso 1 devolve o modelo só em xG com piso de segurança', () => {
    expect(blendExpectedGoals(goalsExpected, xgExpected, 1)).toEqual(xgExpected)
    expect(blendExpectedGoals(goalsExpected, { home: -2, away: 0 }, 1)).toEqual({ home: 0.05, away: 0.05 })
  })

  it('peso intermediário interpola linearmente os dois λ', () => {
    const blended = blendExpectedGoals(goalsExpected, xgExpected, 0.5)
    expect(blended.home).toBeCloseTo(1.5, 12)
    expect(blended.away).toBeCloseTo(1.15, 12)
  })

  it('λ em xG usa a mesma mecânica de taxas regularizadas (escala de gols)', () => {
    const xgMatches: ModelMatch[] = [
      { home: 'casa-forte', away: 'visitante-fraco', homeGoals: 2.4, awayGoals: 0.6, kickoff: '', seasonYear: 2026, sourceOrdinal: 1 },
      { home: 'visitante-fraco', away: 'casa-forte', homeGoals: 1.1, awayGoals: 0.9, kickoff: '', seasonYear: 2026, sourceOrdinal: 2 },
    ]
    const expected = expectedGoalsFromXg('casa-forte', 'visitante-fraco', xgMatches, 20)
    // Mando somado ao ataque superior: mandante tem λ claramente maior
    expect(expected.home).toBeGreaterThan(expected.away)
    expect(expected.home).toBeGreaterThan(0.05)
  })
})

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
