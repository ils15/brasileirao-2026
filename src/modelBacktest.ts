import { BACKTEST_CUTOFF, SHRINKAGE_CANDIDATES } from './projectionConfig'
import { currentSeasonResults } from './currentSeasonResults'
import { historicalSeasons, type HistoricalMatch } from './historicalSeasons'
import {
  expectedGoalsForVariant,
  MODEL_PARAMETERS,
  poissonResultProbabilities,
  type ForecastVariant,
  type ModelMatch,
} from './matchModel'
import { splitWalkForwardByKickoff } from './chronology'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'

export { splitWalkForwardByKickoff } from './chronology'

export interface BrierResult {
  brier: number
}

export interface AblationSeason {
  year: number
  trainingMatches: number
  testMatches: number
  homeAwayShrinkageMatches: number
  combinedShrinkageMatches: number
  baseline: BrierResult
  homeAway: BrierResult
  h2h: BrierResult
  combined: BrierResult
}

export interface FeatureBacktest {
  cutoffMatches: number
  baselineShrinkageMatches: number
  productionShrinkageMatches: number
  h2hShrinkageMatches: number
  h2hConsistentlyImproves: boolean
  productionUsesH2H: boolean
  seasons: AblationSeason[]
}

const teamIdAliases: Readonly<Record<string, string>> = {
  saopaulo: 'sao-paulo',
}

function historicalModelMatch(teamIds: readonly string[], match: HistoricalMatch, year: number): ModelMatch {
  const [homeIndex, awayIndex, homeGoals, awayGoals, kickoff, sourceOrdinal] = match
  const home = teamIdAliases[teamIds[homeIndex]!] ?? teamIds[homeIndex]!
  const away = teamIdAliases[teamIds[awayIndex]!] ?? teamIds[awayIndex]!
  return { home, away, homeGoals, awayGoals, kickoff, seasonYear: year, sourceOrdinal }
}

function historicalModelMatches(): ModelMatch[] {
  return historicalSeasons.flatMap((season) => season.matches.map((match) => historicalModelMatch(season.teamIds, match, season.year)))
}

export function buildProductionTrainingMatches(currentResults = currentSeasonResults): ModelMatch[] {
  const historical = historicalModelMatches()
  const current = filterAtOrBeforeAnalyticalCutoff(currentResults).map((match, index): ModelMatch => ({
    home: match.home,
    away: match.away,
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
    kickoff: match.kickoff,
    seasonYear: 2026,
    sourceOrdinal: match.source === 'football-data' ? Number(match.sourceRef.replace('csv-line-', '')) : 10_000 + index,
  }))
  return [...historical, ...current]
}

const productionTrainingMatches = buildProductionTrainingMatches()
let cachedFeatureBacktest: FeatureBacktest | null = null

function outcomeIndex(match: ModelMatch): 0 | 1 | 2 {
  return match.homeGoals > match.awayGoals ? 0 : match.homeGoals === match.awayGoals ? 1 : 2
}

function brierScore(prediction: readonly number[], actual: number): number {
  return prediction.reduce((sum, probability, index) => sum + (probability - Number(index === actual)) ** 2, 0)
}

function scoreMatches(
  training: readonly ModelMatch[],
  test: readonly ModelMatch[],
  year: number,
  variant: ForecastVariant,
  shrinkageMatches: number,
): BrierResult {
  const brier = test.reduce((sum, match) => {
    const expected = expectedGoalsForVariant(match.home, match.away, training, year, variant, shrinkageMatches)
    return sum + brierScore(poissonResultProbabilities(expected), outcomeIndex(match))
  }, 0)
  return { brier: brier / test.length }
}

function bestPriorCandidate(scoresByYear: ReadonlyMap<number, ReadonlyMap<number, number>>, years: readonly number[]): number {
  if (years.length === 0) return 12
  return SHRINKAGE_CANDIDATES.reduce((best, candidate) => {
    const score = years.reduce((sum, year) => sum + (scoresByYear.get(year)?.get(candidate) ?? Number.POSITIVE_INFINITY), 0)
    const bestScore = years.reduce((sum, year) => sum + (scoresByYear.get(year)?.get(best) ?? Number.POSITIVE_INFINITY), 0)
    return score < bestScore ? candidate : best
  }, SHRINKAGE_CANDIDATES[0]!)
}

function bestOverallCandidate(scoresByYear: ReadonlyMap<number, ReadonlyMap<number, number>>): number {
  return bestPriorCandidate(scoresByYear, [...scoresByYear.keys()])
}

function candidateScores(
  training: readonly ModelMatch[],
  test: readonly ModelMatch[],
  year: number,
  variant: 'home-away' | 'combined',
): Map<number, number> {
  return new Map(SHRINKAGE_CANDIDATES.map((candidate) => [
    candidate,
    scoreMatches(training, test, year, variant, candidate).brier,
  ]))
}

export function runFeatureBacktest(): FeatureBacktest {
  if (cachedFeatureBacktest) return cachedFeatureBacktest
  const seasons: AblationSeason[] = []
  const homeAwayCandidates = new Map<number, Map<number, number>>()
  const combinedCandidates = new Map<number, Map<number, number>>()
  const allHistoricalMatches = historicalModelMatches()

  for (const season of historicalSeasons) {
    const seasonMatches = season.matches
      .map((match) => historicalModelMatch(season.teamIds, match, season.year))
    const { training: cutoff, test } = splitWalkForwardByKickoff(seasonMatches, BACKTEST_CUTOFF)
    const priorMatches = allHistoricalMatches.filter((match) => match.seasonYear < season.year)
    const training = [...priorMatches, ...cutoff]
    const priorYears = seasons.map(({ year }) => year)
    const homeAwayShrinkageMatches = bestPriorCandidate(homeAwayCandidates, priorYears)
    const combinedShrinkageMatches = bestPriorCandidate(combinedCandidates, priorYears)
    const baseline = scoreMatches(training, test, season.year, 'baseline', MODEL_PARAMETERS.baselineShrinkageMatches)
    const homeAway = scoreMatches(training, test, season.year, 'home-away', homeAwayShrinkageMatches)
    const h2h = scoreMatches(training, test, season.year, 'h2h', MODEL_PARAMETERS.baselineShrinkageMatches)
    const combined = scoreMatches(training, test, season.year, 'combined', combinedShrinkageMatches)

    seasons.push({
      year: season.year,
      trainingMatches: training.length,
      testMatches: test.length,
      homeAwayShrinkageMatches,
      combinedShrinkageMatches,
      baseline,
      homeAway,
      h2h,
      combined,
    })
    homeAwayCandidates.set(season.year, candidateScores(training, test, season.year, 'home-away'))
    combinedCandidates.set(season.year, candidateScores(training, test, season.year, 'combined'))
  }

  const h2hConsistentlyImproves = seasons.every((season) => season.h2h.brier < season.baseline.brier
    && season.combined.brier < season.homeAway.brier)
  cachedFeatureBacktest = {
    cutoffMatches: BACKTEST_CUTOFF,
    baselineShrinkageMatches: MODEL_PARAMETERS.baselineShrinkageMatches,
    productionShrinkageMatches: bestOverallCandidate(homeAwayCandidates),
    h2hShrinkageMatches: MODEL_PARAMETERS.h2hShrinkageMatches,
    h2hConsistentlyImproves,
    // Mixed folds and no independent validation: production forecast weight remains zero.
    productionUsesH2H: false,
    seasons,
  }
  return cachedFeatureBacktest
}

export { productionTrainingMatches }
