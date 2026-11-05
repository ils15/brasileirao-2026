import { estimateExpectedGoals, type ExpectedGoals } from './projection'
import { poissonResultProbabilities } from './matchModel'

/**
 * Probabilidade de resultado (H/E/F) por confronto, com os gols esperados λ
 * que a produzem — a rastreabilidade do número fica explícita: λ casa/fora →
 * Poisson independente → marginais por resultado.
 */
export interface MatchProbability {
  homeId: string
  awayId: string
  expected: ExpectedGoals
  /** [vitória mandante, empate, vitória visitante], soma 1. */
  probabilities: [number, number, number]
}

export function matchProbabilities(homeId: string, awayId: string): MatchProbability {
  const expected = estimateExpectedGoals(homeId, awayId)
  return { homeId, awayId, expected, probabilities: poissonResultProbabilities(expected) }
}
