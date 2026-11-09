import { currentClubs, remainingFixtures } from './projectionData'
import { currentSeasonResults, type CurrentSeasonMatch } from './currentSeasonResults'
import { historicalSeasons } from './historicalSeasons'
import { normalizeTeamId } from './clubIds'
import { filterAtOrBeforeAnalyticalCutoff, isAtOrBeforeAnalyticalCutoff } from './sourceMetadata'

export interface VenueStats {
  matches: number
  wins: number
  draws: number
  losses: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  pointsPerMatch: number | null
}

export interface SplitStats {
  home: VenueStats
  away: VenueStats
}

export interface HeadToHeadMatch {
  seasonYear: number
  kickoff: string
  home: string
  away: string
  homeGoals: number
  awayGoals: number
  source: 'football-data' | 'openfootball' | 'espn'
  sourceRef?: string
}

const emptyVenueStats = (): VenueStats => ({
  matches: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  points: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  pointsPerMatch: null,
})

function addResult(stats: VenueStats, goalsFor: number, goalsAgainst: number): void {
  stats.matches += 1
  stats.goalsFor += goalsFor
  stats.goalsAgainst += goalsAgainst
  if (goalsFor > goalsAgainst) {
    stats.wins += 1
    stats.points += 3
  } else if (goalsFor === goalsAgainst) {
    stats.draws += 1
    stats.points += 1
  } else {
    stats.losses += 1
  }
}

function finishStats(stats: VenueStats): VenueStats {
  stats.goalDifference = stats.goalsFor - stats.goalsAgainst
  stats.pointsPerMatch = stats.matches === 0 ? null : stats.points / stats.matches
  return stats
}

type ScoreMatch = Pick<CurrentSeasonMatch, 'home' | 'away' | 'homeGoals' | 'awayGoals'>

function summarizeMatches(matches: readonly ScoreMatch[], clubId: string): SplitStats {
  const home = emptyVenueStats()
  const away = emptyVenueStats()
  for (const match of matches) {
    if (match.home === clubId) addResult(home, match.homeGoals, match.awayGoals)
    if (match.away === clubId) addResult(away, match.awayGoals, match.homeGoals)
  }
  return { home: finishStats(home), away: finishStats(away) }
}

export function getCurrentVenueStats(clubId: string, matches = currentSeasonResults): SplitStats {
  return summarizeMatches(filterAtOrBeforeAnalyticalCutoff(matches), clubId)
}

function historicalMatchesFor(clubId: string): ScoreMatch[] {
  const result: ScoreMatch[] = []
  for (const season of historicalSeasons) {
    const ids = season.teamIds.map(normalizeTeamId)
    season.matches.forEach(([home, away, homeGoals, awayGoals]) => {
      const homeId = ids[home]!
      const awayId = ids[away]!
      if (homeId !== clubId && awayId !== clubId) return
      result.push({ home: homeId, away: awayId, homeGoals, awayGoals })
    })
  }
  return result
}

export function getHistoricalVenueStats(clubId: string): SplitStats {
  return summarizeMatches(historicalMatchesFor(clubId), clubId)
}

function pairMatches(homeId: string, awayId: string, currentResults: readonly CurrentSeasonMatch[]): HeadToHeadMatch[] {
  const current = filterAtOrBeforeAnalyticalCutoff(currentResults)
    .filter((match) => (match.home === homeId && match.away === awayId)
      || (match.home === awayId && match.away === homeId))
    .map((match): HeadToHeadMatch => ({ ...match, seasonYear: 2026 }))
  const historical: HeadToHeadMatch[] = []

  for (const season of historicalSeasons) {
    const ids = season.teamIds.map(normalizeTeamId)
    season.matches.forEach(([home, away, homeGoals, awayGoals, kickoff]) => {
      const homeTeam = ids[home]!
      const awayTeam = ids[away]!
      if (!((homeTeam === homeId && awayTeam === awayId) || (homeTeam === awayId && awayTeam === homeId))) return
      historical.push({
        seasonYear: season.year,
        kickoff,
        home: homeTeam,
        away: awayTeam,
        homeGoals,
        awayGoals,
        source: season.provenance ? 'openfootball' : 'football-data',
        sourceRef: season.provenance?.rawUrl,
      })
    })
  }

  return [...current, ...historical]
    .sort((left, right) => right.seasonYear - left.seasonYear || right.kickoff.localeCompare(left.kickoff))
}

function summarizeHeadToHead(matches: readonly HeadToHeadMatch[], clubId: string): SplitStats {
  const home = emptyVenueStats()
  const away = emptyVenueStats()
  for (const match of matches) {
    if (match.home === clubId) addResult(home, match.homeGoals, match.awayGoals)
    if (match.away === clubId) addResult(away, match.awayGoals, match.homeGoals)
  }
  return { home: finishStats(home), away: finishStats(away) }
}

export interface HeadToHeadSummary {
  historical: SplitStats
  current: SplitStats
  matches: HeadToHeadMatch[]
}

export function getHeadToHeadSummary(
  homeId: string,
  awayId: string,
  currentResults: readonly CurrentSeasonMatch[] = currentSeasonResults,
): HeadToHeadSummary {
  const matches = pairMatches(homeId, awayId, currentResults)
  return {
    historical: summarizeHeadToHead(matches.filter(({ seasonYear }) => seasonYear <= 2025), homeId),
    current: summarizeHeadToHead(matches.filter(({ seasonYear }) => seasonYear === 2026), homeId),
    matches,
  }
}

export function validateCurrentSeason(): {
  clubs: number
  completedMatches: number
  remainingMatches: number
  scheduledMatches: number
  mismatchedClubs: number
} {
  const allFixtures = [
    ...currentSeasonResults.map(({ home, away }) => ({ home, away })),
    ...remainingFixtures,
  ]
  const uniqueFixtures = new Set(allFixtures.map(({ home, away }) => `${home}:${away}`))
  const fixtureCounts = new Map(currentClubs.map(({ id }) => [id, 0]))
  for (const fixture of allFixtures) {
    fixtureCounts.set(fixture.home, (fixtureCounts.get(fixture.home) ?? 0) + 1)
    fixtureCounts.set(fixture.away, (fixtureCounts.get(fixture.away) ?? 0) + 1)
  }

  const mismatchedClubs = currentClubs.filter((club) => {
    const stats = getCurrentVenueStats(club.id)
    return fixtureCounts.get(club.id) !== 38
      || stats.home.matches + stats.away.matches !== club.played
      || stats.home.wins + stats.away.wins !== club.wins
      || stats.home.draws + stats.away.draws !== club.draws
      || stats.home.losses + stats.away.losses !== club.losses
      || stats.home.goalsFor + stats.away.goalsFor !== club.goalsFor
      || stats.home.goalsAgainst + stats.away.goalsAgainst !== club.goalsAgainst
      || stats.home.points + stats.away.points !== club.points
  }).length

  const validCutoff = currentSeasonResults.every((match) => isAtOrBeforeAnalyticalCutoff(match.kickoff, match.source))
  const validFixtures = uniqueFixtures.size === allFixtures.length && fixtureCounts.size === 20
  // completedMatches sempre reflete a base filtrada pelo corte — a mesma
  // usada nas estatísticas (auditoria: bases misturadas).
  const completedMatches = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).length
  if (!validCutoff || !validFixtures) return { clubs: currentClubs.length, completedMatches, remainingMatches: remainingFixtures.length, scheduledMatches: allFixtures.length, mismatchedClubs: currentClubs.length }

  return {
    clubs: currentClubs.length,
    completedMatches,
    remainingMatches: remainingFixtures.length,
    scheduledMatches: allFixtures.length,
    mismatchedClubs,
  }
}
