import type { ModelMatch } from './matchModel'

/**
 * Elo dinâmico por clube: força que atravessa temporadas e acompanha
 * a forma em cada partida. Independente do modelo Poisson de gols —
 * é esse desacoplamento que o ensemble explora.
 */

export const ELO_BASE = 1500
export const ELO_HOME_ADVANTAGE = 65
export const ELO_K = 32

/** Pontuação esperada do mandante (vitória=1, empate=0,5, derrota=0). */
export function eloExpectedScore(homeRating: number, awayRating: number, homeAdvantage = ELO_HOME_ADVANTAGE): number {
  return 1 / (1 + 10 ** (-(homeRating + homeAdvantage - awayRating) / 400))
}

/** Multiplicador de K pela diferença de gols (margens grandes movem mais). */
function marginFactor(goalDifference: number): number {
  const abs = Math.abs(goalDifference)
  return abs <= 1 ? 1 : 1 + (abs - 1) * 0.5
}

/** Tabela de ratings treinada sequencialmente sobre os placares. */
export class EloTable {
  private readonly ratings = new Map<string, number>()
  private readonly drawRate: number

  constructor(matches: readonly ModelMatch[], drawRate: number, base = ELO_BASE) {
    this.drawRate = drawRate
    for (const match of matches) {
      const home = this.ratings.get(match.home) ?? base
      const away = this.ratings.get(match.away) ?? base
      const expected = eloExpectedScore(home, away)
      const actual = match.homeGoals > match.awayGoals ? 1 : match.homeGoals === match.awayGoals ? 0.5 : 0
      const goalDifference = match.homeGoals - match.awayGoals
      const delta = ELO_K * marginFactor(goalDifference) * (actual - expected)
      this.ratings.set(match.home, home + delta)
      this.ratings.set(match.away, away - delta)
    }
  }

  /** H/E/F da perspectiva do mandante, a partir do rating vigente. */
  resultProbabilities(homeId: string, awayId: string): [number, number, number] {
    const home = this.ratings.get(homeId) ?? ELO_BASE
    const away = this.ratings.get(awayId) ?? ELO_BASE
    const expected = eloExpectedScore(home, away)
    // Empate concentrado perto de E=0,5, decaindo nos extremos; escala pela
    // taxa de empates da liga (~26% no Brasileirão).
    const draw = this.drawRate * (1 - Math.abs(2 * expected - 1))
    const remainder = 1 - draw
    const homeWin = Math.max(0, remainder * (expected / (expected + (1 - expected))))
    return [homeWin, Math.max(0, draw), Math.max(0, remainder - homeWin)]
  }

  ratingOf(clubId: string): number {
    return this.ratings.get(clubId) ?? ELO_BASE
  }
}
