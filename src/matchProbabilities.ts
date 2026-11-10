import { estimateExpectedGoals, type ExpectedGoals } from './projection'
import { poissonResultProbabilities, mostProbableScores, type MostProbableScores } from './matchModel'

/**
 * Probabilidade de resultado (H/E/F) por confronto, com os gols esperados λ
 * que a produzem e os placares mais prováveis (moda estatística conjunta).
 */
export interface MatchProbability {
  homeId: string
  awayId: string
  expected: ExpectedGoals
  /** [vitória mandante, empate, vitória visitante], soma 1. */
  probabilities: [number, number, number]
  /** Placares mais prováveis baseados em ataque, defesa e mando de campo. */
  mostProbable: MostProbableScores
}

export function matchProbabilities(homeId: string, awayId: string): MatchProbability {
  const expected = estimateExpectedGoals(homeId, awayId)
  return {
    homeId,
    awayId,
    expected,
    probabilities: poissonResultProbabilities(expected),
    mostProbable: mostProbableScores(expected),
  }
}
