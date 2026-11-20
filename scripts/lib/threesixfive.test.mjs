import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePackagedResults } from './dataPipeline.mjs'
import {
  CLUB_NAME_SLUGS,
  currentSeasonNum,
  filterCurrentSeason,
  mergeAdvancedStats,
  parseGameDetail,
  parseResultsPage,
  parseStatsCards,
  renderAdvancedStatsModule,
  stampSeasonNum,
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
    expect(() => validateAdvancedStats([], { expectedMatches: 1 })).toThrow(/Nenhum cartão/)
    expect(() => validateAdvancedStats([], { expectedMatches: 1, strict: true })).toThrow(/≠ jogos disputados/)
  })

  it('compara ΣxG apenas com os gols dos jogos cobertos (cobertura parcial)', () => {
    const covered = { ...base, seasonNum: undefined, xgHome: 1.1, xgAway: 1.9 }
    const noXg = {
      gameId: 4632699, seasonNum: undefined, roundNum: 9, home: 'bahia', away: 'santos',
      homeScore: 5, awayScore: 5, hasXg: false, xgHome: null, xgAway: null,
      yellowHome: 1, yellowAway: 2, redHome: 0, redAway: 0,
    }
    const summary = validateAdvancedStats([covered, noXg])
    expect(summary.goals).toBe(13)
    expect(summary.goalsCovered).toBe(3)
    expect(summary.xgRatio).toBe(1)
  })
})

describe('validateAdvancedStats: cobertura parcial monotônica (D01)', () => {
  const covered = parseGameDetail(gameDetail)
  const records = [
    { ...covered, seasonNum: undefined, xgHome: 1.1, xgAway: 1.9 },
    {
      gameId: 4632700, seasonNum: undefined, roundNum: 9, home: 'bahia', away: 'santos',
      homeScore: 1, awayScore: 1, hasXg: true, xgHome: 1.2, xgAway: 0.8,
      yellowHome: 2, yellowAway: 1, redHome: 0, redAway: 0,
    },
  ]
  const packagedPairs = ['vitoria|fluminense', 'bahia|santos', 'gremio|vasco']

  it('não-estrito aceita lote menor e mostra missing derivado do pacote', () => {
    const summary = validateAdvancedStats(records, { expectedMatches: packagedPairs.length, packagedPairs })
    expect(summary.ok).toBe(true)
    expect(summary.issues).toHaveLength(1)
    expect(summary.coverage).toEqual({ matches: records.length, expected: packagedPairs.length, missing: ['gremio|vasco'] })
  })

  it('strict continua exigindo igualdade com o pacote', () => {
    expect(() => validateAdvancedStats(records, { expectedMatches: packagedPairs.length, packagedPairs, strict: true }))
      .toThrow(/≠ jogos disputados/)
    expect(validateAdvancedStats(records, { expectedMatches: records.length, strict: true }).coverage.missing).toEqual([])
  })

  it('pacote real: não lança em não-estrito e missing fecha a diferença de cobertura', () => {
    const snapshot = JSON.parse(readFileSync('data/source-snapshots/advanced-stats-2026.json', 'utf8'))
    const packaged = parsePackagedResults(readFileSync('src/currentSeasonResults.ts', 'utf8'))
    const pairs = packaged.map((match) => `${match.home}|${match.away}`)
    const summary = validateAdvancedStats(snapshot.records, { expectedMatches: pairs.length, packagedPairs: pairs })

    expect(summary.ok).toBe(true)
    expect(summary.coverage.matches).toBe(snapshot.records.length)
    expect(summary.coverage.expected).toBe(packaged.length)
    expect(summary.coverage.missing).toHaveLength(packaged.length - snapshot.records.length)
    expect(summary.coverage.missing.every((pair) => pairs.includes(pair))).toBe(true)
    expect(() => validateAdvancedStats(snapshot.records, { expectedMatches: pairs.length, strict: true }))
      .toThrow(/≠ jogos disputados/)
  })
})

// Snapshot legado (até 2026-11-07): registros gravados SEM `seasonNum`, só o
// topo do snapshot declara a temporada. Fixture sintética, temporada simbólica.
const SEASON = 76
const OLD_SEASON = 75
const legacyRecords = () => [
  { gameId: 5001, roundNum: 1, home: 'flamengo', away: 'palmeiras', homeScore: 2, awayScore: 0, hasXg: true, xgHome: 1.4, xgAway: 0.7, shotsHome: 8, shotsAway: 5, yellowHome: 2, yellowAway: 1, redHome: 0, redAway: 0 },
  { gameId: 5002, roundNum: 1, home: 'corinthians', away: 'santos', homeScore: 1, awayScore: 1, hasXg: true, xgHome: 0.9, xgAway: 1.2, shotsHome: 6, shotsAway: 7, yellowHome: 1, yellowAway: 3, redHome: 0, redAway: 1 },
  { gameId: 5003, roundNum: 2, home: 'gremio', away: 'vasco', homeScore: 0, awayScore: 2, hasXg: true, xgHome: 0.6, xgAway: 1.5, shotsHome: 6, shotsAway: 9, yellowHome: 3, yellowAway: 2, redHome: 1, redAway: 0 },
]

describe('stampSeasonNum', () => {
  it('carimba o seasonNum ausente, preserva quem já declara, a ordem, e não muta a entrada', () => {
    const legacy = legacyRecords()
    const aliased = { ...legacy[0], gameId: 5009, home: 'bahia', away: 'santos', awayScore: 0, seasonNum: OLD_SEASON }
    const stamped = stampSeasonNum([aliased, legacy[1], legacy[2]], SEASON)

    expect(stamped.map((record) => record.gameId)).toEqual([5009, 5002, 5003])
    expect(stamped.map((record) => record.seasonNum)).toEqual([OLD_SEASON, SEASON, SEASON])
    expect(stamped[1]).toEqual({ ...legacy[1], seasonNum: SEASON })
    expect(legacy[1].seasonNum).toBeUndefined() // entrada não mutada
    expect(stamped[0]).not.toBe(aliased)
  })

  it('destrava o filtro da temporada corrente: sem carimbo, zero registros', () => {
    const legacy = legacyRecords()
    // Comportamento anterior ao carimbo: o filtro descarta tudo; em modo
    // estrito a contagem da validação aborta com "N ≠ jogos disputados".
    expect(filterCurrentSeason(legacy, SEASON)).toHaveLength(0)
    expect(() => validateAdvancedStats(filterCurrentSeason(legacy, SEASON), { expectedMatches: legacy.length, strict: true })).toThrow(/≠ jogos disputados/)

    const stamped = stampSeasonNum(legacy, SEASON)
    const current = filterCurrentSeason(stamped, SEASON)
    expect(current).toHaveLength(legacy.length)
    expect(validateAdvancedStats(current, { expectedMatches: legacy.length }).matches).toBe(legacy.length)
  })

  it('falha alto quando há registros e o snapshot não declara temporada', () => {
    expect(() => stampSeasonNum(legacyRecords(), undefined)).toThrow(/seasonNum ausente/)
    expect(() => stampSeasonNum(legacyRecords(), null)).toThrow(/seasonNum ausente/)
    expect(stampSeasonNum([], undefined)).toEqual([])
  })
})

describe('renderAdvancedStatsModule', () => {
  it('gera módulo TS com registros ordenados, metadados da fonte e cobertura', () => {
    const detail = parseGameDetail(gameDetail)
    const source = renderAdvancedStatsModule({
      records: [detail],
      fetchedAt: '2026-11-07T12:00:00Z',
      sourceSha: 'abc123',
      seasonNum: 76,
      coverage: { matches: 1, expected: 2, missing: ['bahia|santos'] },
    })
    expect(source).toContain("export const advancedMatches: readonly AdvancedMatchRecord[] = [")
    expect(source).toContain("{ gameId: 4632607, round: 34, home: 'vitoria', away: 'fluminense'")
    expect(source).toContain('xgHome: 1.10, xgAway: 1.90')
    expect(source).toContain("sha256: 'abc123'")
    expect(source).toContain('coverage: {\n    matches: 1,\n    expected: 2,\n    missing: [\'bahia|santos\'],\n  },')
    expect(CLUB_NAME_SLUGS['Vitoria']).toBe('vitoria')
  })

  it('sem cobertura explícita declara o conjunto completo', () => {
    const detail = parseGameDetail(gameDetail)
    const source = renderAdvancedStatsModule({ records: [detail], fetchedAt: '2026-11-07T12:00:00Z', sourceSha: 'abc123', seasonNum: 76 })
    expect(source).toContain('matches: 1,\n    expected: 1,\n    missing: [],')
  })
})
