import { describe, expect, it } from 'vitest'
import { splitWalkForwardByKickoff } from './chronology'
import { currentSeasonResults } from './currentSeasonResults'
import { buildProductionTrainingMatches, runFeatureBacktest } from './modelBacktest'
import { expectedGoalsForVariant } from './matchModel'
import { runTemporalBacktest } from './projection'
import { SHRINKAGE_CANDIDATES } from './projectionConfig'

describe('corte temporal do walk-forward', () => {
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
      kickoff: '2026-11-03T23:59:00Z', source: 'espn' as const, sourceRef: 'pre-cutoff-test-only',
    }
    const afterCutoff = {
      home: 'flamengo',
      away: 'palmeiras',
      homeGoals: 9,
      awayGoals: 0,
      kickoff: '2026-11-04T16:01:00Z',
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
