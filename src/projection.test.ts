import { describe, expect, it } from 'vitest'
import { ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'
import { standings } from './data'
import { currentSeasonResults } from './currentSeasonResults'
import { HISTORICAL_SOURCE } from './historicalSeasons'
import { historicalSeasons, remainingFixtures, currentClubs } from './projectionData'
import { buildCurrentSeasonHeadToHead, buildPointsAnalysis, compareHeadToHeadForTable, isPositionInZone, runProjection, runTemporalBacktest, simulateOneSeason, validateHistoricalSeason, ZONES } from './projection'

describe('projeção estática do Brasileirão 2026', () => {
  it('mantém as fronteiras G-6, seis vagas seguintes na Sul-Americana e rebaixamento', () => {
    expect(isPositionInZone(6, ZONES.libertadores)).toBe(true)
    expect(isPositionInZone(7, ZONES.libertadores)).toBe(false)
    expect(isPositionInZone(7, ZONES.sudamericana)).toBe(true)
    expect(isPositionInZone(12, ZONES.sudamericana)).toBe(true)
    expect(ZONES.sudamericana).toMatchObject({ from: 7, to: 12 })
    expect(ZONES.middle).toMatchObject({ from: 13, to: 16 })
    expect(ZONES.relegation).toMatchObject({ from: 17, to: 20 })
  })

  it('usa o confronto direto 2026 concluído no desempate de dois clubes empatados', () => {
    const headToHead = buildCurrentSeasonHeadToHead()
    const flamengoAgainstPalmeiras = headToHead.get('flamengo')?.get('palmeiras')
    const palmeirasAgainstFlamengo = headToHead.get('palmeiras')?.get('flamengo')
    expect(flamengoAgainstPalmeiras).toEqual({ points: 0, goalDifference: -3, goalsFor: 0 })
    expect(palmeirasAgainstFlamengo).toEqual({ points: 3, goalDifference: 3, goalsFor: 3 })
    expect(compareHeadToHeadForTable(flamengoAgainstPalmeiras!, palmeirasAgainstFlamengo!)).toBeGreaterThan(0)
    expect(compareHeadToHeadForTable(palmeirasAgainstFlamengo!, flamengoAgainstPalmeiras!)).toBeLessThan(0)
    expect(buildCurrentSeasonHeadToHead([
      ...currentSeasonResults,
      {
        home: 'flamengo', away: 'palmeiras', homeGoals: 9, awayGoals: 0,
        kickoff: new Date(Date.parse(ANALYTICAL_CUTOFF_UTC) + 86_400_000).toISOString(), source: 'espn', sourceRef: 'future-test-only',
      },
    ])).toEqual(headToHead)
  })

  it('aplica gols marcados no confronto como terceiro critério de desempate H2H', () => {
    // Mesmos pontos e mesmo saldo no confronto: quem marcou mais gols leva.
    const fewerGoals = { points: 4, goalDifference: 0, goalsFor: 2 }
    const moreGoals = { points: 4, goalDifference: 0, goalsFor: 5 }
    expect(compareHeadToHeadForTable(fewerGoals, moreGoals)).toBeGreaterThan(0)
    expect(compareHeadToHeadForTable(moreGoals, fewerGoals)).toBeLessThan(0)
    expect(compareHeadToHeadForTable(moreGoals, { ...moreGoals })).toBe(0)
  })

  it('usa 20 clubes, os jogos restantes consistentes com o calendário e temporadas históricas validadas', () => {
    // Invariantes derivados (a suíte continua válida após atualizações pós-rodada)
    expect(currentClubs).toHaveLength(20)
    expect(HISTORICAL_SOURCE.url).toBe('https://www.football-data.co.uk/new/BR.csv')
    expect(HISTORICAL_SOURCE.localFileMtime).toBe('2026-11-04T10:52:14-03:00')
    expect(HISTORICAL_SOURCE.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(remainingFixtures.length).toBeLessThanOrEqual(48)
    expect(remainingFixtures.length).toBeGreaterThan(0)
    // Cada pendente é um par único do calendário não disputado
    const remainingPairs = remainingFixtures.map(({ home, away }) => `${home}:${away}`)
    expect(new Set(remainingPairs).size).toBe(remainingFixtures.length)
    // Snapshot == classificação derivada dos resultados (mesma checagem de rounds.test)
    expect(currentClubs.map(({ position, club, points, played }) => ({ position, club, points, played }))).toEqual(
      standings.map(({ position, club, points, played }) => ({ position, club, points, played })),
    )
    for (const club of currentClubs) {
      expect(club.wins + club.draws + club.losses).toBe(club.played)
      expect(club.wins * 3 + club.draws).toBe(club.points)
      const remaining = remainingFixtures.filter((fixture) => fixture.home === club.id || fixture.away === club.id)
      expect(club.played + remaining.length).toBe(38)
    }
    expect(historicalSeasons).toHaveLength(14)
    for (const season of historicalSeasons) {
      // 2016 tem 379: Chapecoense × Atlético-MG de 11/12/2016 ficou sem placar no CSV
      expect(season.matches.length).toBeGreaterThanOrEqual(379)
      expect(season.matches.length).toBeLessThanOrEqual(380)
      const chronology = season.matches.map(([, , , , kickoff, sourceOrdinal]) => ({ kickoff, sourceOrdinal }))
      expect(chronology).toHaveLength(season.matches.length)
      expect(chronology.every(({ kickoff }) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(kickoff))).toBe(true)
      expect(chronology.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual(Array.from({ length: season.matches.length }, (_, index) => index + 1))
      expect(chronology).toEqual([...chronology].sort((left, right) =>
        left.kickoff.localeCompare(right.kickoff) || left.sourceOrdinal - right.sourceOrdinal,
      ))
      const validation = validateHistoricalSeason(season)
      expect(validation.clubs).toBe(20)
      if (season.validation.standingsVerified) {
        expect(season.officialStandings).toHaveLength(20)
        expect(validation).toEqual({ matches: season.matches.length, clubs: 20, mismatchedClubs: 0, standingsVerified: true })
      } else {
        expect(season.officialStandings).toBeUndefined()
        expect(validation).toEqual({ matches: season.matches.length, clubs: 20, mismatchedClubs: 0, standingsVerified: false })
      }
    }
  })

  it('conserva partidas e pontos, aplica as vagas e rebaixa exatamente quatro clubes', () => {
    const result = simulateOneSeason(12345)
    expect(result.table).toHaveLength(20)
    expect(result.table.every((club) => club.played === 38)).toBe(true)
    expect(result.table.reduce((total, club) => total + club.points, 0)).toBe(result.totalPoints)
    // Conservação real: o total final precisa fechar com a soma dos pontos
    // de partida mais os pontos distribuídos nos 48 jogos simulados.
    expect(result.pointsAtStart + result.pointsAdded).toBe(result.totalPoints)
    expect(result.table.filter((club) => club.position <= 4)).toHaveLength(4)
    expect(result.table.filter((club) => club.position === 5)).toHaveLength(1)
    expect(result.table.filter((club) => club.position >= 1 && club.position <= 6)).toHaveLength(6)
    expect(result.table.filter((club) => club.position >= 7 && club.position <= 12)).toHaveLength(6)
    expect(result.table.filter((club) => club.position >= 13 && club.position <= 16)).toHaveLength(4)
    expect(result.table.filter((club) => club.position >= 17)).toHaveLength(4)
  })

  it('é reprodutível e mantém probabilidades entre zero e um com título somando 100%', () => {
    const first = runProjection({ simulations: 120, seed: 20261104 })
    const second = runProjection({ simulations: 120, seed: 20261104 })
    expect(first.clubProbabilities).toEqual(second.clubProbabilities)
    expect(first.pointsAnalysis).toEqual(second.pointsAnalysis)
    expect(first.pointCurve).toEqual(second.pointCurve)
    expect(Object.fromEntries(first.pointsAnalysis.distributionByOutcome.map(({ id, samples }) => [id, samples]))).toEqual({
      champion: 120,
      libertadores: 600,
      sudamericana: 720,
      middle: 480,
      relegation: 480,
    })
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

  it('rejeita amostras com pontuação negativa ou não inteira', () => {
    const analysis = buildPointsAnalysis([
      { points: -3, outcome: 'relegation' },
      { points: 40.5, outcome: 'champion' },
      { points: 30, outcome: 'relegation' },
    ])
    const relegation = analysis.distributionByOutcome.find(({ id }) => id === 'relegation')
    const champion = analysis.distributionByOutcome.find(({ id }) => id === 'champion')
    expect(relegation?.samples).toBe(1)
    expect(relegation?.points).toEqual([{ points: 30, count: 1, probability: 1 }])
    expect(champion?.samples).toBe(0)
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
    expect(backtest.modelBrier).toBeCloseTo(0.61335, 5)
    expect(backtest.tableBrier).toBeCloseTo(0.34386, 5)
    // k de produção escolhido por walk-forward (k aplicado à última
    // temporada usando apenas anos anteriores), não in-sample.
    expect(backtest.productionShrinkageMatches).toBe(15)
  })

  it('mantém os kickoffs empatados juntos e informa os folds do backtest sem usar jogos futuros', () => {
    const backtest = runTemporalBacktest()
    expect(backtest.matches).toBe(1121)
    expect(backtest.cutoffMatches).toBe(300)
    expect(backtest.seasons.map((season) => season.year)).toEqual([2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    expect(backtest.seasons.map((season) => season.matches)).toEqual([80, 80, 80, 80, 79, 80, 80, 80, 80, 80, 80, 80, 82, 80])
    expect(backtest.seasons.map((season) => season.shrinkageMatches)).toEqual([12, 30, 15, 10, 15, 12, 20, 20, 15, 20, 20, 15, 15, 15])
    // Com 14 dobras, dobras antigas (amostra menor, baselines fortes) podem perder isoladamente;
    // o invariante é a média global melhor e a ampla maioria das dobras.
    expect(backtest.seasons.filter((season) => season.modelBrier >= season.baselineBrier).length).toBeLessThanOrEqual(3)
    expect(backtest.seasons.filter((season) => season.tableBrier >= season.tableBaselineBrier).length).toBeLessThanOrEqual(4)
    expect(backtest.modelBrier).toBeLessThan(backtest.baselineBrier)
    expect(backtest.tableSimulationsPerSeason).toBe(5_000)
    expect(backtest.tableBrier).toBeLessThan(backtest.tableBaselineBrier)
    expect(backtest.productionShrinkageMatches).toBe(15)
    expect(backtest.relativeImprovement).toBeGreaterThan(0.03)
  })

  it('completa as 500.000 simulações e respeita as zonas do cenário G-6', { timeout: 60_000 }, () => {
    const result = runProjection()
    expect(result.simulations).toBe(500_000)
    expect(result.seed).toBe(20_261_104)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.title, 0)).toBeCloseTo(1, 10)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.libertadores, 0)).toBeCloseTo(6, 10)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.sudamericana, 0)).toBeCloseTo(6, 10)
    expect(result.clubProbabilities.reduce((sum, club) => sum + club.relegation, 0)).toBeCloseTo(4, 10)
  })

  it('resume pontos finais por clube com mediana, percentis, desvio e IC Wilson', () => {
    const result = runProjection({ simulations: 250, seed: 777 })
    for (const club of result.clubProbabilities) {
      const stats = club.pointsStats
      expect(stats.samples).toBe(250)
      expect(stats.min).toBeLessThanOrEqual(stats.p10)
      expect(stats.p10).toBeLessThanOrEqual(stats.p25)
      expect(stats.p25).toBeLessThanOrEqual(stats.median)
      expect(stats.median).toBeLessThanOrEqual(stats.p75)
      expect(stats.p75).toBeLessThanOrEqual(stats.p90)
      expect(stats.p90).toBeLessThanOrEqual(stats.max)
      // Pontos finais só podem crescer em relação aos pontos atuais no
      // snapshot — os jogos restantes distribuem pontos não negativos.
      expect(stats.min).toBeGreaterThanOrEqual(club.currentPoints)
      expect(Number.isInteger(stats.median)).toBe(true)
      expect(stats.stdDev).toBeGreaterThanOrEqual(0)
      for (const interval of [club.titleInterval, club.libertadoresInterval, club.sudamericanaInterval, club.relegationInterval]) {
        expect(interval.lower95).toBeLessThanOrEqual(interval.probability)
        expect(interval.probability).toBeLessThanOrEqual(interval.upper95)
        expect(interval.lower95).toBeGreaterThanOrEqual(0)
        expect(interval.upper95).toBeLessThanOrEqual(1)
      }
    }
    // A μ exibida como base de treino precisa ser a média da base efetiva
    // (histórico completo + 332 jogos de 2026 até o corte), não do histórico puro.
    expect(result.trainingGoalAverages.home).toBeGreaterThan(0)
    expect(result.leagueAverageGoals.home).toBeGreaterThan(0)
    expect(result.trainingGoalAverages.home).not.toBe(result.leagueAverageGoals.home)
  })
})
