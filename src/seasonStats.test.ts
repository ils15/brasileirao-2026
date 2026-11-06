import { describe, expect, it } from 'vitest'
import { currentClubs, remainingFixtures } from './projectionData'
import { currentSeasonResults, CURRENT_SEASON_SOURCE } from './currentSeasonResults'
import { ANALYTICAL_CUTOFF_UTC, filterAtOrBeforeAnalyticalCutoff, isAtOrBeforeAnalyticalCutoff } from './sourceMetadata'
import { getCurrentVenueStats, getHeadToHeadSummary, getHistoricalVenueStats, validateCurrentSeason } from './seasonStats'
import { cbfOfficialSchedule } from './cbfOfficialSchedule'

describe('dados do snapshot 2026 e estatísticas por mando', () => {
  it('reconcilia resultados, 20 clubes, 380 jogos e pendentes sem ultrapassar o corte', () => {
    expect(CURRENT_SEASON_SOURCE.espn.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(currentSeasonResults).toHaveLength(filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).length)
    expect(currentSeasonResults.every((match) => Date.parse(match.kickoff) <= Date.parse(ANALYTICAL_CUTOFF_UTC))).toBe(true)
    expect(validateCurrentSeason()).toEqual({
      clubs: 20,
      completedMatches: currentSeasonResults.length,
      remainingMatches: remainingFixtures.length,
      scheduledMatches: 380,
      mismatchedClubs: 0,
    })
    expect(remainingFixtures.every((fixture) => fixture.cbfRef.length > 0)).toBe(true)
    expect(new Set(remainingFixtures.map((fixture) => fixture.cbfRef)).size).toBe(remainingFixtures.length)
    expect(cbfOfficialSchedule).toHaveLength(380)

    const sourceByRef = new Map(cbfOfficialSchedule.map(([ref, round, home, away]) => [ref, { round, home, away }]))
    const playedRefs = new Set(currentSeasonResults.map((match) => {
      const source = cbfOfficialSchedule.find(([, , home, away]) => home === match.home && away === match.away)
      expect(source).toBeDefined()
      return source![0]
    }))
    for (const fixture of remainingFixtures) {
      const [roundLabel] = fixture.round.split(' ')
      expect(sourceByRef.get(fixture.cbfRef)).toEqual({
        round: Number(roundLabel),
        home: fixture.home,
        away: fixture.away,
      })
      expect(playedRefs.has(fixture.cbfRef)).toBe(false)
    }
    expect(playedRefs.size + remainingFixtures.length).toBe(cbfOfficialSchedule.length)
  })

  it('reconcilia os números de casa e fora com cada linha da classificação oficial', () => {
    for (const club of currentClubs) {
      const { home, away } = getCurrentVenueStats(club.id)
      const totalMatches = home.matches + away.matches
      const totalWins = home.wins + away.wins
      const totalDraws = home.draws + away.draws
      const totalLosses = home.losses + away.losses
      expect(totalMatches).toBe(club.played)
      expect(totalWins).toBe(club.wins)
      expect(totalDraws).toBe(club.draws)
      expect(totalLosses).toBe(club.losses)
      expect(home.goalsFor + away.goalsFor).toBe(club.goalsFor)
      expect(home.goalsAgainst + away.goalsAgainst).toBe(club.goalsAgainst)
      expect(home.points + away.points).toBe(club.points)
    }
  })

  it('oferece histórico 2021–2025 separado por mando e com fallback vazio explícito', () => {
    const flamengo = getHistoricalVenueStats('flamengo')
    expect(flamengo.home.matches).toBeGreaterThan(0)
    expect(flamengo.away.matches).toBeGreaterThan(0)
    expect(flamengo.home.pointsPerMatch).toBeGreaterThan(0)
    expect(getHistoricalVenueStats('mirassol').home.matches).toBeGreaterThan(0)
    expect(getHistoricalVenueStats('remo').home.matches).toBe(0)
    expect(getHistoricalVenueStats('remo').away.pointsPerMatch).toBeNull()
    // Ambos derivam do mesmo CSV: footballData (coleta vigente) e historical (pacote 2012–2025)
    expect(CURRENT_SEASON_SOURCE.historical.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('aplica o corte às estatísticas e ao retrospecto H2H 2026', () => {
    const futureResult = {
      home: 'flamengo', away: 'athletico-pr', homeGoals: 9, awayGoals: 0,
      kickoff: new Date(Date.parse(ANALYTICAL_CUTOFF_UTC) + 86_400_000).toISOString(), source: 'espn' as const, sourceRef: 'future-test-only',
    }
    const baseline = getCurrentVenueStats('flamengo')
    expect(getCurrentVenueStats('flamengo', [...currentSeasonResults, futureResult])).toEqual(baseline)

    const h2h = getHeadToHeadSummary('flamengo', 'athletico-pr', [...currentSeasonResults, futureResult])
    expect(h2h.current.home.matches).toBe(0)
    expect(h2h.current.away).toMatchObject({ matches: 1, wins: 0, draws: 1, losses: 0, points: 1 })
    expect(h2h.matches.filter(({ seasonYear }) => seasonYear === 2026)).toEqual([
      expect.objectContaining({ home: 'athletico-pr', away: 'flamengo', homeGoals: 1, awayGoals: 1 }),
    ])
    expect(h2h.historical.home.matches + h2h.historical.away.matches).toBeGreaterThan(0)
  })

  it('mantém timestamps idênticos como um único bloco no corte', () => {
    // Relativo ao corte vigente: um instante no limite, um depois dele e um sem fuso.
    const atCutoff = ANALYTICAL_CUTOFF_UTC
    const afterCutoff = new Date(Date.parse(ANALYTICAL_CUTOFF_UTC) + 60_000).toISOString()
    const kept = filterAtOrBeforeAnalyticalCutoff([
      { kickoff: atCutoff, source: 'espn' as const, id: 'a' },
      { kickoff: atCutoff, source: 'espn' as const, id: 'b' },
      { kickoff: afterCutoff, source: 'espn' as const, id: 'after' },
      { kickoff: ANALYTICAL_CUTOFF_UTC.slice(0, 10) + 'T12:00:00', source: 'espn' as const, id: 'timezone-unknown' },
    ])
    expect(kept.map(({ id }) => id)).toEqual(['a', 'b'])
  })

  it('não interpreta horário exibido pela CBF como publicação nem atribui fuso sem evidência', () => {
    expect(CURRENT_SEASON_SOURCE.cbfStandings.displayedTimestampTimezone).toBe('not specified')
    expect(CURRENT_SEASON_SOURCE.cbfStandings).not.toHaveProperty('pageUpdatedAt')
  })

  it('preserva a proveniência dos resultados ESPN (ausentes no Football-Data) e os mantém antes do corte', () => {
    const espnMatches = currentSeasonResults.filter((match) => match.source === 'espn')
    expect(espnMatches.length).toBeGreaterThan(0)
    for (const match of espnMatches) {
      expect(match.sourceRef).toMatch(/^\d+$/)
      expect(isAtOrBeforeAnalyticalCutoff(match.kickoff, match.source)).toBe(true)
    }
    // Pares únicos
    const pairs = espnMatches.map((match) => `${match.home}:${match.away}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })
})
