import { describe, expect, it } from 'vitest'
import {
  CLUB_NAME_SLUGS,
  currentSeasonNum,
  filterCurrentSeason,
  mergeAdvancedStats,
  parseGameDetail,
  parseResultsPage,
  parseStatsCards,
  renderAdvancedStatsModule,
  validateAdvancedStats,
} from './threesixfive.mjs'

// Fixtures mínimas com o shape real da API 365scores (campos usados pelos parsers).
const resultsPage = JSON.stringify({
  paging: { previousPage: '/web/games/?aftergame=100&direction=-1' },
  games: [
    {
      id: 4632607,
      seasonNum: 76,
      roundNum: 34,
      startTime: '2026-11-06T22:30:00+00:00',
      statusText: 'Ended',
      homeCompetitor: { id: 1228, name: 'Vitoria', score: '0.0' },
      awayCompetitor: { id: 1216, name: 'Fluminense', score: '3.0' },
    },
    {
      id: 4632611,
      seasonNum: 75, // temporada antiga vazando pela paginação
      roundNum: 37,
      startTime: '2025-12-02T22:00:00+00:00',
      statusText: 'Ended',
      homeCompetitor: { id: 999, name: 'Fortaleza', score: '2.0' },
      awayCompetitor: { id: 998, name: 'Juventude', score: '1.0' },
    },
    {
      id: 4632620,
      seasonNum: 76,
      roundNum: 35,
      startTime: '2026-11-12T22:00:00+00:00',
      statusText: 'Scheduled',
      homeCompetitor: { id: 1215, name: 'Flamengo' },
      awayCompetitor: { id: 1222, name: 'Palmeiras' },
    },
  ],
})

const gameDetail = JSON.stringify({
  game: {
    id: 4632607,
    seasonNum: 76,
    roundNum: 34,
    homeCompetitor: { id: 1228, name: 'Vitoria', score: '0.0' },
    awayCompetitor: { id: 1216, name: 'Fluminense', score: '3.0' },
    chartEvents: {
      events: [
        { xg: '0.80', competitorNum: 1 },
        { xg: '0.30', competitorNum: 1 },
        { xg: '1.10', competitorNum: 2 },
        { xg: '0.80', competitorNum: 2 },
        { xg: '-', competitorNum: 1 }, // placeholder da fonte: não conta
        { xg: null, competitorNum: 2 },
      ],
    },
    events: [
      { eventType: { id: 1, name: 'Goal' }, competitorId: 1216 },
      { eventType: { id: 2, name: 'Yellow Card' }, competitorId: 1228 },
      { eventType: { id: 2, name: 'Yellow Card' }, competitorId: 1228 },
      { eventType: { id: 2, name: 'Yellow Card' }, competitorId: 1216 },
      { eventType: { id: 3, name: 'Red Card' }, competitorId: 1228 },
      { eventType: { id: 1000, name: 'Substitution' }, competitorId: 1216 },
    ],
  },
})

const statsPayload = JSON.stringify({
  stats: {
    competitorsStats: {
      tables: [
        {
          name: 'Red Cards',
          rows: [
            { entity: { name: 'Vitoria' }, stats: [{ typeId: 10, value: '5' }, { typeId: 8, value: '78' }] },
            { entity: { name: 'Fluminense' }, stats: [{ typeId: 10, value: '3' }, { typeId: 8, value: '61' }] },
          ],
        },
        { name: 'Yellow Cards', rows: [] },
      ],
    },
  },
})

describe('parseResultsPage', () => {
  it('normaliza jogos da temporada e não aborta com clubes de outras temporadas', () => {
    const games = parseResultsPage(resultsPage)
    expect(games).toHaveLength(3)
    expect(games[0]).toMatchObject({
      gameId: 4632607,
      seasonNum: 76,
      roundNum: 34,
      home: 'vitoria',
      away: 'fluminense',
      homeScore: 0,
      awayScore: 3,
      ended: true,
    })
    expect(games[1].home).toBeNull() // Fortaleza (2025) sem slug: null, não erro
    expect(games[2]).toMatchObject({ ended: false, homeScore: null })
  })

  it('falha quando a resposta não tem lista de jogos', () => {
    expect(() => parseResultsPage(JSON.stringify({ error: 'boom' }))).toThrow(/sem lista de jogos/)
  })
})

describe('currentSeasonNum e filterCurrentSeason', () => {
  it('escolhe a temporada com mais encerrados no ano de referência', () => {
    const pages = [parseResultsPage(resultsPage)]
    expect(currentSeasonNum(pages, 2026)).toBe(76)
  })

  it('guarda a temporada atual: clube sem slug nela é erro de publicação', () => {
    expect(() => filterCurrentSeason([{ seasonNum: 76, home: null, away: 'fluminense' }], 76)).toThrow(/clube sem slug/)
    const kept = filterCurrentSeason([{ seasonNum: 75, home: null, away: null }, { seasonNum: 76, home: 'vasco', away: 'gremio' }], 76)
    expect(kept).toHaveLength(1)
  })
})

describe('parseGameDetail', () => {
  it('soma xG por mando ignorando placeholders e conta cartões por clube', () => {
    const detail = parseGameDetail(gameDetail)
    expect(detail).toMatchObject({
      gameId: 4632607,
      home: 'vitoria',
      away: 'fluminense',
      homeScore: 0,
      awayScore: 3,
      hasXg: true,
      xgHome: 1.1,
      xgAway: 1.9,
      shotsHome: 2,
      shotsAway: 2,
      yellowHome: 2,
      yellowAway: 1,
      redHome: 1,
      redAway: 0,
    })
  })
})

describe('parseStatsCards', () => {
  it('extrai cartões das tabelas agregadas por clube', () => {
    const cards = parseStatsCards(statsPayload)
    expect(cards.get('vitoria')).toEqual({ yellow: 78, red: 5 })
    expect(cards.get('fluminense')).toEqual({ yellow: 61, red: 3 })
  })
})

describe('mergeAdvancedStats e validateAdvancedStats', () => {
  const base = parseGameDetail(gameDetail)

  it('funde por gameId e nunca sobrescreve o já coletado', () => {
    const merged = mergeAdvancedStats([{ ...base, yellowHome: 9 }], [base])
    expect(merged).toHaveLength(1)
    expect(merged[0].yellowHome).toBe(9)
  })

  it('valida pares únicos, ΣxG próximo de Σgols e cartões não negativos', () => {
    const records = [{ ...base, seasonNum: undefined, xgHome: 1.1, xgAway: 1.9 }]
    const summary = validateAdvancedStats(records)
    expect(summary).toMatchObject({ matches: 1, withXg: 1, goals: 3, xg: 3 })
    expect(() => validateAdvancedStats([{ ...base }, { ...base }])).toThrow(/duplicado/)
    expect(() => validateAdvancedStats([{ ...base, yellowHome: -1 }])).toThrow(/Cartão inválido/)
    expect(() => validateAdvancedStats([{ ...base, xgHome: 0, xgAway: 0 }])).toThrow(/ΣxG/)
    expect(() => validateAdvancedStats([], { expectedMatches: 1 })).toThrow(/≠ jogos disputados/)
  })
})

describe('renderAdvancedStatsModule', () => {
  it('gera módulo TS com registros ordenados e metadados da fonte', () => {
    const detail = parseGameDetail(gameDetail)
    const source = renderAdvancedStatsModule({
      records: [detail],
      fetchedAt: '2026-11-07T12:00:00Z',
      sourceSha: 'abc123',
      seasonNum: 76,
    })
    expect(source).toContain("export const advancedMatches: readonly AdvancedMatchRecord[] = [")
    expect(source).toContain("{ gameId: 4632607, round: 34, home: 'vitoria', away: 'fluminense'")
    expect(source).toContain('xgHome: 1.10, xgAway: 1.90')
    expect(source).toContain("sha256: 'abc123'")
    expect(CLUB_NAME_SLUGS['Vitoria']).toBe('vitoria')
  })
})
