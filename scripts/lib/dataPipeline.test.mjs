import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  computeRemaining,
  computeStandings,
  mergeResults,
  parseEspnScoreboard,
  parseFootballDataCsv,
  parseCbfSchedule,
  validateIntegrity,
} from './dataPipeline.mjs'

const schedule = [
  { ref: '001', round: 1, home: 'a', away: 'b' },
  { ref: '002', round: 1, home: 'c', away: 'd' },
  { ref: '003', round: 2, home: 'b', away: 'c' },
  { ref: '004', round: 2, home: 'd', away: 'a' },
]

describe('parseFootballDataCsv', () => {
  const csv = [
    '\uFEFFCountry,League,Season,Date,Time,Home,Away,HG,AG,Res',
    'Brazil,Serie A,2026,05/11/2026,22:30,Flamengo RJ,Palmeiras,2,1,H',
    'Brazil,Serie A,2026,06/11/2026,19:00,Sao Paulo,Gremio,,,',
    'Brazil,Serie A,2026,07/11/2026,21:00,Coritiba,Vitoria,0,0,D',
    'Brazil,Serie A,2025,10/12/2025,18:00,Flamengo RJ,Cruzeiro,3,0,H',
  ].join('\n')

  it('converte nomes CSV em slugs, mont kickoff sem fuso e referencia csv-line 1-based com header', () => {
    const matches = parseFootballDataCsv(csv, { seasonYear: 2026, cutoffDate: '2026-11-07' })
    expect(matches).toEqual([
      { home: 'flamengo', away: 'palmeiras', homeGoals: 2, awayGoals: 1, kickoff: '2026-11-05T22:30', source: 'football-data', sourceRef: 'csv-line-2' },
    ])
  })

  it('exclui o dia-limite inteiro (fuso desconhecido) e linhas sem placar', () => {
    // cutoff 05/11: o jogo de 05/11 fica fora; 06/11 não tem placar no CSV
    const matches = parseFootballDataCsv(csv, { seasonYear: 2026, cutoffDate: '2026-11-05' })
    expect(matches).toHaveLength(0)
  })

  it('falha com nome de clube fora do mapa em vez de empacotar silenciosamente', () => {
    const broken = [
      'Country,League,Season,Date,Time,Home,Away,HG,AG,Res',
      'Brazil,Serie A,2026,05/11/2026,22:30,Nome Desconhecido,Palmeiras,1,0,H',
    ].join('\n')
    expect(() => parseFootballDataCsv(broken, { seasonYear: 2026, cutoffDate: '2026-11-07' })).toThrow(/sem slug conhecido/)
  })
})

describe('parseEspnScoreboard', () => {
  const scoreboard = {
    events: [
      {
        id: '401899001',
        date: '2026-11-12T22:30Z',
        status: { type: { state: 'post' } },
        competitions: [{ competitors: [
          { homeAway: 'home', team: { displayName: 'Flamengo RJ' }, score: '1' },
          { homeAway: 'away', team: { displayName: 'Coritiba' }, score: '1' },
        ] }],
      },
      {
        id: '401899002',
        date: '2026-11-12T23:59Z',
        status: { type: { state: 'in' } },
        competitions: [{ competitors: [
          { homeAway: 'home', team: { displayName: 'Bahia' }, score: '0' },
          { homeAway: 'away', team: { displayName: 'Cruzeiro' }, score: '2' },
        ] }],
      },
      {
        id: '401899003',
        date: '2026-11-13T00:30Z',
        status: { type: { state: 'post' } },
        competitions: [{ competitors: [
          { homeAway: 'home', team: { displayName: 'Gremio' }, score: '3' },
          { homeAway: 'away', team: { displayName: 'Vasco' }, score: '0' },
        ] }],
      },
    ],
  }

  it('mantém apenas concluídos com kickoff ≤ corte UTC', () => {
    const matches = parseEspnScoreboard(JSON.stringify(scoreboard), { cutoffUtc: '2026-11-13T06:00:00Z' })
    expect(matches).toEqual([
      { home: 'flamengo', away: 'coritiba', homeGoals: 1, awayGoals: 1, kickoff: '2026-11-12T22:30Z', source: 'espn', sourceRef: '401899001' },
      { home: 'gremio', away: 'vasco', homeGoals: 3, awayGoals: 0, kickoff: '2026-11-13T00:30Z', source: 'espn', sourceRef: '401899003' },
    ])
  })
})

describe('mergeResults', () => {
  const existing = [{ home: 'a', away: 'b', homeGoals: 1, awayGoals: 0, kickoff: '2026-11-01T20:00', source: 'espn', sourceRef: 'x1' }]
  const incoming = [
    { home: 'c', away: 'd', homeGoals: 2, awayGoals: 2, kickoff: '2026-11-02T19:00', source: 'espn', sourceRef: 'x2' },
    { home: 'a', away: 'b', homeGoals: 9, awayGoals: 9, kickoff: '2026-11-02T20:00', source: 'espn', sourceRef: 'x3' },
    { home: 'a', away: 'zz', homeGoals: 1, awayGoals: 0, kickoff: '2026-11-02T21:00', source: 'espn', sourceRef: 'x4' },
  ]

  it('aceita pares novos do calendário, ignora existentes e rejeita fora do calendário', () => {
    const { merged, added, rejected } = mergeResults({ schedule, existing, incoming })
    expect(added).toHaveLength(1)
    expect(added[0]).toEqual(incoming[0])
    expect(merged).toHaveLength(2)
    expect(rejected).toEqual([{ match: incoming[2], reason: 'par fora do calendário CBF 2026' }])
  })
})

describe('computeStandings e computeRemaining', () => {
  const results = [
    { home: 'a', away: 'b', homeGoals: 2, awayGoals: 0 },
    { home: 'c', away: 'd', homeGoals: 1, awayGoals: 1 },
    { home: 'b', away: 'c', homeGoals: 3, awayGoals: 1 },
  ]

  it('ordena por pontos, vitórias, saldo e gols pró', () => {
    const standings = computeStandings(results, schedule)
    expect(standings.map((row) => row.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(standings[0]).toMatchObject({ id: 'a', played: 1, wins: 1, goalsFor: 2, goalsAgainst: 0, points: 3, position: 1 })
    expect(standings[1]).toMatchObject({ id: 'b', played: 2, points: 3, goalsFor: 3, goalsAgainst: 3 })
    expect(standings[2]).toMatchObject({ id: 'd', played: 1, points: 1, goalDifference: 0 })
    expect(standings[3]).toMatchObject({ id: 'c', played: 2, points: 1, goalDifference: -2 })
  })

  it('pendente de rodada já encerrada é marcado como adiado', () => {
    // Rodada 2 completa (003 e 004 disputados); a rodada 1 ficou com o furo do 002
    const resultsWithHole = [
      { home: 'a', away: 'b', homeGoals: 2, awayGoals: 0 },
      { home: 'b', away: 'c', homeGoals: 3, awayGoals: 1 },
      { home: 'd', away: 'a', homeGoals: 1, awayGoals: 1 },
    ]
    const remaining = computeRemaining(resultsWithHole, schedule)
    expect(remaining).toEqual([{ round: '1 adiado', home: 'c', away: 'd', cbfRef: '002' }])
  })
})

describe('validateIntegrity', () => {
  const results = [{ home: 'a', away: 'b', homeGoals: 1, awayGoals: 0 }]

  it('exige disjunção e soma 380', () => {
    const remaining = [{ round: '1', home: 'c', away: 'd', cbfRef: '002' }, { round: '2', home: 'b', away: 'c', cbfRef: '003' }, { round: '2', home: 'd', away: 'a', cbfRef: '004' }]
    expect(validateIntegrity({ schedule, results, remaining })).toBe(true)

    const broken = [...results, { home: 'a', away: 'b', homeGoals: 0, awayGoals: 0 }]
    expect(() => validateIntegrity({ schedule, results: broken, remaining })).toThrow(/duplicado/)
  })
})

describe('parseCbfSchedule', () => {
  it('extrai 380 tuplas do fonte TS real', () => {
    const source = readFileSync('src/cbfOfficialSchedule.ts', 'utf8')
    const parsed = parseCbfSchedule(source)
    expect(parsed).toHaveLength(380)
    expect(parsed[0]).toEqual({ ref: '001', round: 1, home: 'fluminense', away: 'gremio' })
  })
})
