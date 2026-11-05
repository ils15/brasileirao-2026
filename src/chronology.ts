export interface KickoffMatch {
  kickoff: string
  sourceOrdinal?: number
}

export function splitWalkForwardByKickoff<T extends KickoffMatch>(
  matches: readonly T[],
  minimumTrainingMatches: number,
): { training: T[]; test: T[] } {
  const sorted = matches
    .map((match, inputOrder) => ({ match, inputOrder }))
    .sort((left, right) => left.match.kickoff.localeCompare(right.match.kickoff)
      || (left.match.sourceOrdinal ?? left.inputOrder) - (right.match.sourceOrdinal ?? right.inputOrder)
      || left.inputOrder - right.inputOrder)
    .map(({ match }) => match)

  let boundary = Math.max(0, Math.min(minimumTrainingMatches, sorted.length))
  if (boundary < sorted.length) {
    const boundaryKickoff = sorted[boundary]!.kickoff
    while (boundary > 0 && sorted[boundary - 1]!.kickoff === boundaryKickoff) boundary -= 1
  }
  return { training: sorted.slice(0, boundary), test: sorted.slice(boundary) }
}
