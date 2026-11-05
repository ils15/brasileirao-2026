// Corte analítico regenerado por scripts/update-data.mjs: fim dos jogos da última rodada coletada.
// Football-Data não informa fuso; o dia-limite inteiro permanece de fora (política conservadora).
export const ANALYTICAL_CUTOFF_LOCAL = '2026-11-05T20:29:00-03:00'
export const ANALYTICAL_CUTOFF_UTC = '2026-11-05T20:29:03Z'

export interface CutoffDatedMatch {
  kickoff: string
  source: 'football-data' | 'espn'
}

/**
 * Regras do corte por fonte: Football-Data é comparado pela data (string) por
 * não informar fuso — o dia-limite inteiro é excluído por conservadorismo;
 * ESPN exige sufixo de fuso explícito e usa o instante exato do kickoff.
 */
export function isAtOrBeforeAnalyticalCutoff(kickoff: string, source: CutoffDatedMatch['source']): boolean {
  if (source === 'espn') {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(kickoff)) return false
    return Date.parse(kickoff) <= Date.parse(ANALYTICAL_CUTOFF_UTC)
  }
  const cutoffDate = ANALYTICAL_CUTOFF_UTC.slice(0, 10)
  return kickoff.slice(0, 10) < cutoffDate
}

/** Corte em bloco: registros com kickoff idêntico entram ou saem juntos. */
export function filterAtOrBeforeAnalyticalCutoff<T extends CutoffDatedMatch>(matches: readonly T[]): T[] {
  const decisions = new Map<string, boolean>()
  for (const match of matches) {
    if (!decisions.has(match.kickoff)) decisions.set(match.kickoff, isAtOrBeforeAnalyticalCutoff(match.kickoff, match.source))
  }
  return matches.filter((match) => decisions.get(match.kickoff)!)
}
