import { BACKTEST_CUTOFF, SHRINKAGE_CANDIDATES, XG_BLEND_CANDIDATES, XG_MIN_COVERED_MATCHES } from './projectionConfig'
import { currentSeasonResults } from './currentSeasonResults'
import { modelableHistoricalSeasons, type HistoricalMatch } from './historicalSeasons'
import {
  blendExpectedGoals,
  expectedGoalsForVariant,
  expectedGoalsFromXg,
  MODEL_PARAMETERS,
  poissonResultProbabilities,
  type ExpectedGoals,
  type ForecastVariant,
  type ModelMatch,
} from './matchModel'
import { normalizeTeamId } from './clubIds'
import { splitWalkForwardByKickoff } from './chronology'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'
import { resultsWithRound } from './rounds'
import { advancedMatches } from './advancedStats2026'

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

function historicalModelMatch(teamIds: readonly string[], match: HistoricalMatch, year: number): ModelMatch {
  const [homeIndex, awayIndex, homeGoals, awayGoals, kickoff, sourceOrdinal] = match
  const home = normalizeTeamId(teamIds[homeIndex]!)
  const away = normalizeTeamId(teamIds[awayIndex]!)
  return { home, away, homeGoals, awayGoals, kickoff, seasonYear: year, sourceOrdinal }
}

function historicalModelMatches(): ModelMatch[] {
  return modelableHistoricalSeasons.flatMap((season) => season.matches.map((match) => historicalModelMatch(season.teamIds, match, season.year)))
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

function outcomeIndex(match: { homeGoals: number; awayGoals: number }): 0 | 1 | 2 {
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
  return { brier: test.length === 0 ? 0 : brier / test.length }
}

function bestPriorCandidate(scoresByYear: ReadonlyMap<number, ReadonlyMap<number, number>>, years: readonly number[]): number {
  if (years.length === 0) return 12
  return SHRINKAGE_CANDIDATES.reduce((best, candidate) => {
    const score = years.reduce((sum, year) => sum + (scoresByYear.get(year)?.get(candidate) ?? Number.POSITIVE_INFINITY), 0)
    const bestScore = years.reduce((sum, year) => sum + (scoresByYear.get(year)?.get(best) ?? Number.POSITIVE_INFINITY), 0)
    return score < bestScore ? candidate : best
  }, SHRINKAGE_CANDIDATES[0]!)
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

  for (const season of modelableHistoricalSeasons) {
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
    // k de produção por walk-forward: o k escolhido para a última temporada
    // usando apenas anos anteriores (fora da amostra). Antes da auditoria era
    // o melhor candidato in-sample sobre todas as temporadas exibidas.
    productionShrinkageMatches: seasons[seasons.length - 1]!.homeAwayShrinkageMatches,
    h2hShrinkageMatches: MODEL_PARAMETERS.h2hShrinkageMatches,
    h2hConsistentlyImproves,
    // Mixed folds and no independent validation: production forecast weight remains zero.
    productionUsesH2H: false,
    seasons,
  }
  return cachedFeatureBacktest
}

export { productionTrainingMatches }

// ---------------------------------------------------------------------------
// Blend xG × gols (§18): o peso do xG é calibrado por walk-forward POR RODADA
// de 2026 — treino até a rodada t−1 (gols da base longa + xG das rodadas
// anteriores), teste na rodada t com Brier de resultado. O xG da própria
// rodada nunca entra no treino da rodada.
// ---------------------------------------------------------------------------

export interface XgBlendRoundScore {
  round: number
  matches: number
  brierByWeight: ReadonlyMap<number, number>
}

export interface XgBlendAblation {
  /** Jogos de 2026 com cobertura de xG no dataset de produção. */
  coveredMatches: number
  /** Jogos com cobertura mas fora do calendário (excluídos da ablação). */
  unmatchedMatches: number
  rounds: XgBlendRoundScore[]
  /** Brier acumulado (ponderado por jogos) por peso candidato. */
  brierByWeight: ReadonlyMap<number, number>
  bestWeight: number
  bestImprovesGoalsOnly: boolean
  eligible: boolean
}

/** Dataset xG de produção: registros avançados com cobertura, como ModelMatch. */
export function buildProductionXgMatches(records: readonly { home: string; away: string; xgHome: number | null; xgAway: number | null }[] = advancedMatches): ModelMatch[] {
  return records
    .filter((record) => record.xgHome != null && record.xgAway != null)
    .map((record, index): ModelMatch => ({
      home: record.home,
      away: record.away,
      // "Gols" no espaço xG: a mecânica de taxas é idêntica, a escala é a mesma.
      homeGoals: record.xgHome!,
      awayGoals: record.xgAway!,
      kickoff: '',
      seasonYear: 2026,
      sourceOrdinal: 20_000 + index,
    }))
}

const cachedXgMatches = buildProductionXgMatches()
/** Dataset xG de produção (cached): registros com cobertura, como ModelMatch. */
export const productionXgMatches = cachedXgMatches

/** Brier por peso para uma rodada: λ gols/xG são computados UMA vez por partida (não por peso). */
function scoreRound(
  trainingGoals: readonly ModelMatch[],
  trainingXg: readonly ModelMatch[],
  test: readonly { home: string; away: string; homeGoals: number; awayGoals: number }[],
  variant: ForecastVariant,
  shrinkageMatches: number,
  weights: readonly number[],
): Map<number, number> {
  const predictions = test.map((match) => {
    const goalsExpected: ExpectedGoals = expectedGoalsForVariant(match.home, match.away, trainingGoals, 2026, variant, shrinkageMatches)
    const xgExpected = trainingXg.length > 0 ? expectedGoalsFromXg(match.home, match.away, trainingXg, shrinkageMatches) : null
    return { actual: outcomeIndex(match), goalsExpected, xgExpected }
  })
  const brierByWeight = new Map<number, number>()
  for (const weight of weights) {
    let brierSum = 0
    for (const prediction of predictions) {
      const expected = weight > 0 && prediction.xgExpected
        ? blendExpectedGoals(prediction.goalsExpected, prediction.xgExpected, weight)
        : prediction.goalsExpected
      brierSum += brierScore(poissonResultProbabilities(expected), prediction.actual)
    }
    brierByWeight.set(weight, test.length === 0 ? 0 : brierSum / test.length)
  }
  return brierByWeight
}

let cachedXgBlendAblation: XgBlendAblation | null = null

export function runXgBlendAblation(): XgBlendAblation {
  if (cachedXgBlendAblation) return cachedXgBlendAblation
  const byRound = resultsWithRound()
  const roundOfPair = new Map(byRound.map((match) => [`${match.home}:${match.away}`, match.round]))
  const unmatchedMatches = advancedMatches.length - cachedXgMatches.length
  const history = historicalModelMatches()
  const eligible = cachedXgMatches.length >= XG_MIN_COVERED_MATCHES
  // Rodada 1 fica fora do teste: treino vazio em xG (e curto em gols) não é cenário de produção.
  const testRounds = [...new Set(byRound.map(({ round }) => round))].sort((left, right) => left - right)
    .filter((round) => eligible && round >= 2)

  const rounds: XgBlendRoundScore[] = []
  const totals = new Map<number, { weighted: number; matches: number }>()
  for (const round of testRounds) {
    const test = byRound.filter((match) => match.round === round)
    if (test.length === 0) continue
    const trainingGoals: ModelMatch[] = [...history, ...byRound.filter((match) => match.round < round).map((match): ModelMatch => ({
      home: match.home,
      away: match.away,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      kickoff: match.kickoff,
      seasonYear: 2026,
      sourceOrdinal: match.source === 'football-data' ? Number(match.sourceRef.replace('csv-line-', '')) : 10_000 + match.round,
    }))]
    const trainingXg = cachedXgMatches.filter((match) => (roundOfPair.get(`${match.home}:${match.away}`) ?? Number.POSITIVE_INFINITY) < round)
    const brierByWeight = scoreRound(trainingGoals, trainingXg, test, 'home-away', productionShrinkage(), XG_BLEND_CANDIDATES)
    for (const [weight, brier] of brierByWeight) {
      const totalsEntry = totals.get(weight) ?? { weighted: 0, matches: 0 }
      totalsEntry.weighted += brier * test.length
      totalsEntry.matches += test.length
      totals.set(weight, totalsEntry)
    }
    rounds.push({ round, matches: test.length, brierByWeight })
  }

  const brierByWeight = new Map<number, number>([...totals.entries()].map(([weight, { weighted, matches }]) => [weight, matches > 0 ? weighted / matches : 0]))
  let bestWeight: number = XG_BLEND_CANDIDATES[0]
  for (const weight of XG_BLEND_CANDIDATES) {
    if ((brierByWeight.get(weight) ?? Number.POSITIVE_INFINITY) < (brierByWeight.get(bestWeight) ?? Number.POSITIVE_INFINITY)) bestWeight = weight
  }
  cachedXgBlendAblation = {
    coveredMatches: cachedXgMatches.length,
    unmatchedMatches,
    rounds,
    brierByWeight,
    bestWeight,
    bestImprovesGoalsOnly: bestWeight > 0 && (brierByWeight.get(bestWeight) ?? Number.POSITIVE_INFINITY) < (brierByWeight.get(0) ?? Number.POSITIVE_INFINITY),
    eligible,
  }
  return cachedXgBlendAblation
}

function productionShrinkage(): number {
  return runFeatureBacktest().productionShrinkageMatches
}
