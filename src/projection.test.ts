import { describe, expect, it } from 'vitest'
import { standings } from './data'
import { currentSeasonResults } from './currentSeasonResults'
import { HISTORICAL_SOURCE } from './historicalSeasons'
import { historicalSeasons, remainingFixtures, currentClubs } from './projectionData'
import { buildCurrentSeasonHeadToHead, buildPointsAnalysis, compareHeadToHeadForTable, runProjection, runTemporalBacktest, simulateOneSeason, validateHistoricalSeason } from './projection'

describe('projeção estática do Brasileirão 2026', () => {
  it('usa o confronto direto 2026 concluído no desempate de dois clubes empatados', () => {
    const headToHead = buildCurrentSeasonHeadToHead()
    const flamengoAgainstPalmeiras = headToHead.get('flamengo')?.get('palmeiras')
    const palmeirasAgainstFlamengo = headToHead.get('palmeiras')?.get('flamengo')
    expect(flamengoAgainstPalmeiras).toEqual({ points: 0, goalDifference: -3 })
    expect(palmeirasAgainstFlamengo).toEqual({ points: 3, goalDifference: 3 })
    expect(compareHeadToHeadForTable(flamengoAgainstPalmeiras!, palmeirasAgainstFlamengo!)).toBeGreaterThan(0)
    expect(compareHeadToHeadForTable(palmeirasAgainstFlamengo!, flamengoAgainstPalmeiras!)).toBeLessThan(0)
    expect(buildCurrentSeasonHeadToHead([
      ...currentSeasonResults,
      {
        home: 'flamengo', away: 'palmeiras', homeGoals: 9, awayGoals: 0,
        kickoff: '2026-11-04T16:01:00Z', source: 'espn', sourceRef: 'future-test-only',
      },
    ])).toEqual(headToHead)
  })

  it('usa 20 clubes, os 48 jogos restantes e temporadas históricas completas validadas', () => {
    const expectedSnapshot = [
      [1, 'Flamengo', 73, 33, 22, 7, 4, 68, 28],
      [2, 'Palmeiras', 70, 33, 20, 10, 3, 56, 22],
      [3, 'Cruzeiro', 57, 33, 17, 6, 10, 52, 46],
      [4, 'Fluminense', 54, 33, 15, 9, 9, 52, 42],
      [5, 'Athletico Paranaense', 54, 33, 15, 9, 9, 50, 40],
      [6, 'Bahia', 53, 33, 14, 11, 8, 48, 42],
      [7, 'Atlético Mineiro', 50, 33, 14, 8, 11, 44, 39],
      [8, 'Red Bull Bragantino', 47, 34, 13, 8, 13, 44, 39],
      [9, 'Santos FC', 47, 34, 12, 11, 11, 50, 49],
      [10, 'São Paulo', 43, 33, 12, 7, 14, 39, 39],
      [11, 'Coritiba SAF', 42, 34, 11, 9, 14, 40, 51],
      [12, 'Mirassol', 40, 34, 10, 10, 14, 39, 48],
      [13, 'Botafogo', 39, 33, 10, 9, 14, 45, 53],
      [14, 'Vasco da Gama SAF', 38, 32, 10, 8, 14, 40, 49],
      [15, 'Vitória', 38, 33, 10, 8, 15, 35, 48],
      [16, 'Internacional', 38, 34, 9, 11, 14, 38, 42],
      [17, 'Grêmio', 37, 33, 9, 10, 14, 37, 44],
      [18, 'Corinthians', 36, 33, 9, 9, 15, 36, 42],
      [19, 'Remo', 29, 33, 6, 11, 16, 36, 51],
      [20, 'Chapecoense', 21, 33, 4, 9, 20, 33, 68],
    ] as const

    expect(currentClubs).toHaveLength(20)
    expect(HISTORICAL_SOURCE.url).toBe('https://www.football-data.co.uk/new/BR.csv')
    expect(HISTORICAL_SOURCE.localFileMtime).toBe('2026-11-04T10:52:14-03:00')
    expect(HISTORICAL_SOURCE.sha256).toBe('ed5c0925007f9ae35f97558993e597d41807e3f1507fae9d7e555bbab5b02bcf')
    expect(remainingFixtures).toHaveLength(48)
    for (const round of ['35', '36', '37', '38']) {
      expect(remainingFixtures.filter((fixture) => fixture.round === round)).toHaveLength(10)
    }
    expect(remainingFixtures.filter((fixture) => fixture.round === '34 adiado')).toHaveLength(7)
    expect(remainingFixtures.filter((fixture) => fixture.round === '21 adiado')).toHaveLength(1)
    expect(currentClubs.map(({ position, club, points, played, wins, draws, losses, goalsFor, goalsAgainst }) =>
      [position, club, points, played, wins, draws, losses, goalsFor, goalsAgainst],
    )).toEqual(expectedSnapshot)
    expect(currentClubs.map(({ position, club, points, played }) => ({ position, club, points, played }))).toEqual(
      standings.map(({ position, club, points, played }) => ({ position, club, points, played })),
    )
    for (const club of currentClubs) {
      expect(club.wins + club.draws + club.losses).toBe(club.played)
      expect(club.wins * 3 + club.draws).toBe(club.points)
      const remaining = remainingFixtures.filter((fixture) => fixture.home === club.id || fixture.away === club.id)
      expect(club.played + remaining.length).toBe(38)
    }
    expect(historicalSeasons.map((season) => season.matches)).toHaveLength(5)
    for (const season of historicalSeasons) {
      expect(season.matches).toHaveLength(380)
      const chronology = season.matches.map(([, , , , kickoff, sourceOrdinal]) => ({ kickoff, sourceOrdinal }))
      expect(chronology).toHaveLength(380)
      expect(chronology.every(({ kickoff }) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(kickoff))).toBe(true)
      expect(chronology.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual(Array.from({ length: 380 }, (_, index) => index + 1))
      expect(chronology).toEqual([...chronology].sort((left, right) =>
        left.kickoff.localeCompare(right.kickoff) || left.sourceOrdinal - right.sourceOrdinal,
      ))
      expect(season.officialStandings).toHaveLength(20)
      expect(season.validation.mismatchedClubs).toBe(0)
      expect(validateHistoricalSeason(season)).toEqual({ matches: 380, clubs: 20, mismatchedClubs: 0 })
    }
  })

  it('conserva partidas e pontos, aplica as vagas e rebaixa exatamente quatro clubes', () => {
    const result = simulateOneSeason(12345)
    expect(result.table).toHaveLength(20)
    expect(result.table.every((club) => club.played === 38)).toBe(true)
    expect(result.table.reduce((total, club) => total + club.points, 0)).toBe(result.totalPoints)
    expect(result.table.filter((club) => club.position <= 4)).toHaveLength(4)
    expect(result.table.filter((club) => club.position === 5)).toHaveLength(1)
    expect(result.table.filter((club) => club.position >= 6 && club.position <= 11)).toHaveLength(6)
    expect(result.table.filter((club) => club.position >= 17)).toHaveLength(4)
  })

  it('é reprodutível e mantém probabilidades entre zero e um com título somando 100%', () => {
    const first = runProjection({ simulations: 120, seed: 20261104 })
    const second = runProjection({ simulations: 120, seed: 20261104 })
    expect(first.clubProbabilities).toEqual(second.clubProbabilities)
    expect(first.pointsAnalysis).toEqual(second.pointsAnalysis)
    expect(first.pointCurve).toEqual(second.pointCurve)
    expect(first.clubProbabilities.reduce((sum, club) => sum + club.title, 0)).toBeCloseTo(1, 12)
    for (const club of first.clubProbabilities) {
      expect(club.title).toBeGreaterThanOrEqual(0)
      expect(club.title).toBeLessThanOrEqual(1)
      expect(club.libertadores).toBeGreaterThanOrEqual(0)
      expect(club.libertadores).toBeLessThanOrEqual(1)
      expect(club.sudamericana).toBeGreaterThanOrEqual(0)
      expect(club.sudamericana).toBeLessThanOrEqual(1)
      expect(club.relegation).toBeGreaterThanOrEqual(0)
      expect(club.relegation).toBeLessThanOrEqual(1)
    }
    for (const outcome of first.pointsAnalysis.distributionByOutcome) {
      const shares = outcome.points.map((point) => point.probability)
      if (outcome.samples === 0) expect(outcome.points).toHaveLength(0)
      else expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 12)
    }
    for (const points of new Set(first.pointCurve.rows.map((row) => row.points))) {
      const probabilities = first.pointCurve.rows.filter((row) => row.points === points).map((row) => row.probability)
      expect(probabilities.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1, 12)
    }
  })

  it('conta cada pontuação inteira exata, usa N por resultado e omite pontos sem observações', () => {
    const analysis = buildPointsAnalysis([
      { points: 40, outcome: 'champion' },
      { points: 40, outcome: 'champion' },
      { points: 41, outcome: 'champion' },
      { points: 40, outcome: 'libertadores' },
      { points: 42, outcome: 'libertadores' },
      { points: 41, outcome: 'sudamericana' },
    ])

    expect(analysis.distributionByOutcome.find(({ id }) => id === 'champion')).toEqual({
      id: 'champion',
      label: 'Campeão',
      samples: 3,
      points: [
        { points: 40, count: 2, probability: 2 / 3 },
        { points: 41, count: 1, probability: 1 / 3 },
      ],
    })
    expect(analysis.distributionByOutcome.find(({ id }) => id === 'libertadores')?.points).toEqual([
      { points: 40, count: 1, probability: 0.5 },
      { points: 42, count: 1, probability: 0.5 },
    ])
    expect(analysis.distributionByOutcome.find(({ id }) => id === 'relegation')?.points).toEqual([])
    expect(analysis.distributionByOutcome.every((outcome) => outcome.points.every((point) => point.count > 0))).toBe(true)
    expect(analysis.distributionByOutcome.flatMap((outcome) => outcome.points).some(({ points }) => points === 39)).toBe(false)
  })

  it('retorna distribuições vazias para categorias sem amostras', () => {
    const analysis = buildPointsAnalysis([])
    expect(analysis.distributionByOutcome.every((row) => row.samples === 0 && row.points.length === 0)).toBe(true)
  })

  it('corta o backtest pela data/hora explícita mesmo quando as partidas chegam fora da ordem do array', () => {
    const season = historicalSeasons[0]!
    const originalMatches = season.matches
    let backtest: ReturnType<typeof runTemporalBacktest>
    season.matches = [...originalMatches].reverse()
    try {
      backtest = runTemporalBacktest()
    } finally {
      season.matches = originalMatches
    }
    expect(backtest.modelBrier).toBeCloseTo(0.61794, 5)
    expect(backtest.tableBrier).toBeCloseTo(0.40907, 5)
    expect(backtest.productionShrinkageMatches).toBe(20)
  })

  it('mantém os kickoffs empatados juntos e informa os folds do backtest sem usar jogos futuros', () => {
    const backtest = runTemporalBacktest()
    expect(backtest.matches).toBe(402)
    expect(backtest.cutoffMatches).toBe(300)
    expect(backtest.seasons.map((season) => season.year)).toEqual([2021, 2022, 2023, 2024, 2025])
    expect(backtest.seasons.map((season) => season.matches)).toEqual([80, 80, 80, 82, 80])
    expect(backtest.seasons.map((season) => season.shrinkageMatches)).toEqual([12, 20, 8, 12, 12])
    expect(backtest.seasons.every((season) => season.modelBrier < season.baselineBrier)).toBe(true)
    expect(backtest.seasons.every((season) => season.tableBrier < season.tableBaselineBrier)).toBe(true)
    expect(backtest.modelBrier).toBeLessThan(backtest.baselineBrier)
    expect(backtest.tableSimulationsPerSeason).toBe(5_000)
    expect(backtest.tableBrier).toBeLessThan(backtest.tableBaselineBrier)
    expect(backtest.productionShrinkageMatches).toBe(20)
    expect(backtest.relativeImprovement).toBeGreaterThan(0.03)
  })

  it('completa as 20.000 simulações aprovadas e conserva as vagas do torneio', () => {
    const result = runProjection()
    expect(result.simulations).toBe(20_000)
    expect(result.seed).toBe(20_261_104)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.title, 0)).toBeCloseTo(1, 10)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.libertadores, 0)).toBeCloseTo(5, 10)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.sudamericana, 0)).toBeCloseTo(6, 10)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.relegation, 0)).toBeCloseTo(4, 10)
  })
})
