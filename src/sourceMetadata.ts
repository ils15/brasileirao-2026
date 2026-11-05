export const ANALYTICAL_CUTOFF_LOCAL = '2026-11-04T13:00:00-03:00'
export const ANALYTICAL_CUTOFF_UTC = '2026-11-04T16:00:00Z'

export interface CutoffDatedMatch {
  kickoff: string
  source: 'football-data' | 'espn'
}

export function isAtOrBeforeAnalyticalCutoff(kickoff: string, source: CutoffDatedMatch['source']): boolean {
  if (source === 'espn') {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(kickoff)) return false
    const kickoffTime = Date.parse(kickoff)
    return Number.isFinite(kickoffTime) && kickoffTime <= Date.parse(ANALYTICAL_CUTOFF_UTC)
  }

  // Football-Data does not publish the timezone for its Time column. Its 2026 rows
  // stop on Nov 2. Exclude the whole boundary date rather than guessing its timezone.
  return kickoff.slice(0, 10) < ANALYTICAL_CUTOFF_UTC.slice(0, 10)
}

export function filterAtOrBeforeAnalyticalCutoff<T extends CutoffDatedMatch>(matches: readonly T[]): T[] {
  const rowsByKickoff = new Map<string, T[]>()
  for (const match of matches) {
    const block = rowsByKickoff.get(match.kickoff) ?? []
    block.push(match)
    rowsByKickoff.set(match.kickoff, block)
  }

  const allowedKickoffs = new Set([...rowsByKickoff]
    .filter(([, block]) => block.every(({ kickoff, source }) => isAtOrBeforeAnalyticalCutoff(kickoff, source)))
    .map(([kickoff]) => kickoff))
  return matches.filter(({ kickoff }) => allowedKickoffs.has(kickoff))
}
