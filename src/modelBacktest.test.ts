import { describe, expect, it } from 'vitest'
import { splitWalkForwardByKickoff } from './chronology'
import { ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'
import { currentSeasonResults } from './currentSeasonResults'
import { advancedMatches } from './advancedStats2026'
import { buildProductionTrainingMatches, buildProductionXgMatches, productionXgMatches, runFeatureBacktest, runXgBlendAblation } from './modelBacktest'
import { expectedGoalsForVariant } from './matchModel'
import { runTemporalBacktest } from './projection'
import { SHRINKAGE_CANDIDATES, XG_BLEND_CANDIDATES, XG_MIN_COVERED_MATCHES, XG_BLEND_WEIGHT } from './projectionConfig'
import { historicalSeasons, historicalQueryableSeasons, modelableHistoricalSeasons } from './historicalSeasons'

describe('corte temporal do walk-forward', () => {
  it('mantém 2003–2011 apenas no histórico consultável e exclui essas temporadas dos modelos', () => {
    expect(historicalQueryableSeasons).toBe(historicalSeasons)
    expect(modelableHistoricalSeasons).toEqual(historicalSeasons.filter(({ year }) => year >= 2012))
    expect(buildProductionTrainingMatches().every(({ seasonYear }) => seasonYear >= 2012)).toBe(true)
  })

  it('mantém todos os jogos com o mesmo kickoff no mesmo lado do corte', () => {
    const matches = [
      { kickoff: '2025-01-01T10:00:00Z', id: 'a' },
      { kickoff: '2025-01-02T10:00:00Z', id: 'b' },
      { kickoff: '2025-01-03T10:00:00Z', id: 'c1' },
      { kickoff: '2025-01-03T10:00:00Z', id: 'c2' },
      { kickoff: '2025-01-03T10:00:00Z', id: 'c3' },
      { kickoff: '2025-01-04T10:00:00Z', id: 'd' },
    ]

    const { training, test } = splitWalkForwardByKickoff(matches, 3)
    expect(training.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(test.map(({ id }) => id)).toEqual(['c1', 'c2', 'c3', 'd'])
    expect(training.some(({ kickoff }) => test.some((match) => match.kickoff === kickoff))).toBe(false)
  })

  it('compara baseline, casa/fora, H2H e combinado em folds anuais sem reutilizar folds futuros no tuning', () => {
    const backtest = runFeatureBacktest()
    expect(backtest.seasons.map(({ year }) => year)).toEqual([2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    expect(backtest.seasons.every(({ trainingMatches, testMatches }) => trainingMatches >= 300 && testMatches >= 79)).toBe(true)
    expect(backtest.seasons.every(({ baseline, homeAway, h2h, combined }) =>
      [baseline.brier, homeAway.brier, h2h.brier, combined.brier].every(Number.isFinite),
    )).toBe(true)
    expect(SHRINKAGE_CANDIDATES).toContain(backtest.productionShrinkageMatches)
    expect(backtest.h2hShrinkageMatches).toBe(6)
    expect(backtest.productionUsesH2H).toBe(false)
  })

  it('exclui resultados posteriores ao corte do modelo de produção e preserva o backtest histórico', () => {
    const featureBacktestBefore = runFeatureBacktest()
    const temporalBacktestBefore = runTemporalBacktest()
    const before = buildProductionTrainingMatches(currentSeasonResults)
    const beforeCutoff = {
      home: 'flamengo', away: 'palmeiras', homeGoals: 1, awayGoals: 0,
      kickoff: new Date(Date.parse(ANALYTICAL_CUTOFF_UTC) - 60_000).toISOString(), source: 'espn' as const, sourceRef: 'pre-cutoff-test-only',
    }
    const afterCutoff = {
      home: 'flamengo',
      away: 'palmeiras',
      homeGoals: 9,
      awayGoals: 0,
      kickoff: new Date(Date.parse(ANALYTICAL_CUTOFF_UTC) + 86_400_000).toISOString(),
      source: 'espn' as const,
      sourceRef: 'future-test-only',
    }
    const withBeforeCutoff = buildProductionTrainingMatches([...currentSeasonResults, beforeCutoff])
    const withBoth = buildProductionTrainingMatches([...currentSeasonResults, beforeCutoff, afterCutoff])

    expect(withBeforeCutoff).toHaveLength(before.length + 1)
    expect(withBoth).toEqual(withBeforeCutoff)
    expect(expectedGoalsForVariant('flamengo', 'palmeiras', withBoth, 2026, 'home-away', 15))
      .toEqual(expectedGoalsForVariant('flamengo', 'palmeiras', withBeforeCutoff, 2026, 'home-away', 15))
    expect(runFeatureBacktest()).toEqual(featureBacktestBefore)
    expect(runTemporalBacktest()).toEqual(temporalBacktestBefore)
  })
})

describe('blend xG × gols (§18)', () => {
  it('dataset xG de produção cobre apenas jogos com xG e pertence ao calendário', () => {
    expect(advancedMatches.length).toBeGreaterThanOrEqual(XG_MIN_COVERED_MATCHES)
    expect(productionXgMatches).toHaveLength(advancedMatches.filter((record) => record.xgHome != null && record.xgAway != null).length)
    expect(productionXgMatches.every((match) => Number.isFinite(match.homeGoals) && match.homeGoals >= 0 && Number.isFinite(match.awayGoals) && match.awayGoals >= 0)).toBe(true)
    expect(buildProductionXgMatches()).toEqual(productionXgMatches)
  })

  it('ablação walk-forward: pesos delimitam os modelos puros e o melhor é um candidato', () => {
    const ablation = runXgBlendAblation()
    expect(ablation.eligible).toBe(true)
    expect(ablation.unmatchedMatches).toBe(0)
    // Todas as rodadas completas (≥ 2) aparecem no teste, cada uma com todos os pesos
    expect(ablation.rounds.length).toBeGreaterThanOrEqual(25)
    expect(ablation.rounds.every(({ matches }) => matches > 0 && matches <= 11)).toBe(true)
    for (const round of ablation.rounds) {
      expect([...round.brierByWeight.keys()]).toEqual([...XG_BLEND_CANDIDATES])
      expect([...round.brierByWeight.values()].every(Number.isFinite)).toBe(true)
    }
    expect(XG_BLEND_CANDIDATES).toContain(ablation.bestWeight)
    for (const [weight, brier] of ablation.brierByWeight) {
      expect(brier).toBe(ablation.rounds.reduce((sum, round) => sum + round.brierByWeight.get(weight)! * round.matches, 0) / ablation.rounds.reduce((sum, round) => sum + round.matches, 0))
    }
    // O peso de produção é uma decisão documentada (§18) tomada no corte da
    // adoção: precisa ser candidato válido. Igualdade com `bestWeight` não é
    // fixada — atualizações de dados podem mover o vencedor sem invalidar a
    // decisão original; o painel acima exibe o vencedor corrente.
    expect(XG_BLEND_CANDIDATES).toContain(XG_BLEND_WEIGHT)
  })
})
