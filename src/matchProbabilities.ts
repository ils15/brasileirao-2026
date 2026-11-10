import { estimateExpectedGoals, type ExpectedGoals } from './projection'
import {
  poissonResultProbabilities,
  mostProbableScores,
  getDiverseQuickScores,
  type MostProbableScores,
  type ScoreOutcome,
} from './matchModel'

/**
 * Probabilidade de resultado (H/E/F) por confronto, com os gols esperados λ
 * que a produzem, os placares mais prováveis e a lista de placares rápidos/elásticos.
 */
export interface MatchProbability {
  homeId: string
  awayId: string
  expected: ExpectedGoals
  /** [vitória mandante, empate, vitória visitante], soma 1. */
  probabilities: [number, number, number]
  /** Placares mais prováveis baseados em ataque, defesa e mando de campo. */
  mostProbable: MostProbableScores
  /** Lista diversificada dos placares mais plausíveis e elásticos para o duelo. */
  quickScores: ScoreOutcome[]
}

export function matchProbabilities(homeId: string, awayId: string, multiplier = 1.0): MatchProbability {
  const expected = estimateExpectedGoals(homeId, awayId)
  return {
    homeId,
    awayId,
    expected,
    probabilities: poissonResultProbabilities(expected),
    mostProbable: mostProbableScores(expected, 0, multiplier),
    quickScores: getDiverseQuickScores(expected, 0, multiplier),
  }
}
