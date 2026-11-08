import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scorers } from '../../src/data.ts'
import { SCORERS_SOURCE, scorers2026 } from '../../src/scorers2026.ts'
import { ANALYTICAL_CUTOFF_UTC } from '../../src/sourceMetadata.ts'
import {
  mergeMatches,
  parseMatchDetail,
  parseScorers,
  parseTable,
  reconcileTable,
  renderScorersModule,
} from './apifutebolbr.mjs'

const scorersPayload = JSON.stringify([
  { atleta: { atleta_id: 1, nome_popular: 'Viveros' }, time: { time_id: 185, nome_popular: 'Athletico-PR' }, gols: 21 },
  { atleta: { atleta_id: 2, nome_popular: 'Pedro' }, time: { time_id: 18, nome_popular: 'Flamengo' }, gols: 20 },
  { atleta: { atleta_id: 3, nome_popular: 'Gabriel' }, time: { time_id: 24, nome_popular: 'Santos' }, gols: 15 },
])

const tablePayload = JSON.stringify([
  { posicao: 1, pontos: 76, time: { time_id: 18, nome_popular: 'Flamengo' }, jogos: 34, vitorias: 23, empates: 7, derrotas: 4, gols_pro: 71, gols_contra: 29, saldo_gols: 42 },
  { posicao: 2, pontos: 70, time: { time_id: 66, nome_popular: 'Palmeiras' }, jogos: 34, vitorias: 21, empates: 7, derrotas: 6, gols_pro: 60, gols_contra: 30, saldo_gols: 30 },
])

const matchPayload = JSON.stringify({
  partida_id: 27979,
  placar_mandante: 2,
  placar_visitante: 1,
  time_mandante: { time_id: 64, nome_popular: 'Bragantino' },
  time_visitante: { time_id: 24, nome_popular: 'Santos' },
  data_realizacao_iso: '2026-11-05T22:30:00-03:00',
  estadio: { nome: 'Estádio Nabi Abi Chedid' },
  rodada: 34,
  gols: {
    mandante: [
      { atleta: { atleta_id: 5, nome_popular: 'Vitinho' }, minuto: '10:00', penalti: false, gol_contra: false },
      { atleta: { atleta_id: 6, nome_popular: 'Zé Marcos' }, minuto: '80:00', penalti: true, gol_contra: false },
    ],
    visitante: [{ atleta: { atleta_id: 7, nome_popular: 'Guilherme' }, minuto: '23:00', penalti: false, gol_contra: true }],
  },
  cartoes: {
    amarelo: { mandante: [{ cartao_id: 1 }, { cartao_id: 2 }], visitante: [{ cartao_id: 3 }] },
    vermelho: { mandante: [], visitante: [{ cartao_id: 9 }] },
  },
  estatisticas: {
    mandante: { posse_de_bola: '52%', escanteios: 5, finalizacao: { total: 12, no_gol: 5, bloqueado: 3, na_trave: 1 }, passes: { total: 400, precisao: '81%' }, desarmes: 14, defensivo: { defesas: 3 } },
    visitante: { posse_de_bola: '48%', escanteios: 4, finalizacao: { total: 9, no_gol: 3, bloqueado: 4, na_trave: 0 }, passes: { total: 380, precisao: '79%' }, desarmes: 11, defensivo: { defesas: 6 } },
  },
  escalacoes: {
    mandante: {
      esquema_tatico: '4-3-3',
      tecnico: { tecnico_id: 1, nome_popular: 'Marcão' },
      titulares: [{ atleta: { atleta_id: 5, nome_popular: 'Vitinho' }, camisa: '7', posicao: { nome: 'Atacante', sigla: 'ATA' } }],
      reservas: [{ atleta: { atleta_id: 8, nome_popular: 'Reserva Um' }, camisa: '15', posicao: [] }],
    },
    visitante: {
      esquema_tatico: '4-4-2',
      tecnico: { tecnico_id: 2, nome_popular: 'Técnico Visitante' },
      titulares: [{ atleta: { atleta_id: 7, nome_popular: 'Guilherme' }, camisa: '9', posicao: { nome: 'Atacante', sigla: 'ATA' } }],
      reservas: [],
    },
  },
  arbitros: [{ papel: 'árbitro', arbitro: { nome_popular: 'Raphael Claus' } }],
})

describe('parseScorers', () => {
  it('normaliza atletas com slug de clube e ordena por gols', () => {
    const scorers = parseScorers(scorersPayload, { minAthletes: 3 })
    expect(scorers).toEqual([
      { name: 'Viveros', club: 'athletico-pr', goals: 21 },
      { name: 'Pedro', club: 'flamengo', goals: 20 },
      { name: 'Gabriel', club: 'santos', goals: 15 },
    ])
  })

  it('falha com resposta curta (fonte mudou de formato)', () => {
    expect(() => parseScorers(scorersPayload)).toThrow(/Artilharia inesperada/)
  })

  it('falha com nome de time fora do mapa', () => {
    const broken = JSON.stringify([{ atleta: { nome_popular: 'X' }, time: { nome_popular: 'Time Inventado' }, gols: 1 }])
    expect(() => parseScorers(broken, { minAthletes: 1 })).toThrow(/sem slug conhecido/)
  })
})

describe('parseTable e reconcileTable', () => {
  it('normaliza os clubes e concilia com a nossa tabela', () => {
    const apiRows = parseTable(tablePayload, { expectedTeams: 2 })
    const ours = [
      { club: 'flamengo', points: 76, played: 34, wins: 23, draws: 7, losses: 4, goalsFor: 71, goalsAgainst: 29 },
      { club: 'palmeiras', points: 70, played: 34, wins: 21, draws: 7, losses: 6, goalsFor: 60, goalsAgainst: 30 },
    ]
    expect(reconcileTable(apiRows, ours)).toEqual({ divergences: 0, report: [] })
  })

  it('reporta divergências campo a campo', () => {
    const apiRows = parseTable(tablePayload, { expectedTeams: 2 })
    const ours = [
      { club: 'flamengo', points: 75, played: 34, wins: 23, draws: 7, losses: 4, goalsFor: 70, goalsAgainst: 29 },
      { club: 'palmeiras', points: 70, played: 34, wins: 21, draws: 7, losses: 6, goalsFor: 60, goalsAgainst: 30 },
    ]
    const { divergences, report } = reconcileTable(apiRows, ours)
    expect(divergences).toBe(2)
    expect(report.join(' ')).toMatch(/flamengo\.points: API 76 vs nós 75/)
    expect(report.join(' ')).toMatch(/flamengo\.goalsFor: API 71 vs nós 70/)
  })

  it('falha com tabela incompleta em produção (20 clubes esperados)', () => {
    expect(() => parseTable(tablePayload)).toThrow(/Tabela inesperada/)
  })
})

describe('parseMatchDetail e mergeMatches', () => {
  it('extrai gols por atleta, cartões por clube, estatísticas, árbitros e metadados', () => {
    const detail = parseMatchDetail(matchPayload)
    expect(detail).toMatchObject({
      partidaId: 27979,
      home: 'bragantino',
      away: 'santos',
      homeGoals: 2,
      awayGoals: 1,
      date: '2026-11-05T22:30:00-03:00',
      stadium: 'Estádio Nabi Abi Chedid',
      round: 34,
      yellowHome: 2,
      yellowAway: 1,
      redHome: 0,
      redAway: 1,
    })
    expect(detail.goals.home).toEqual([
      { atletaId: 5, atleta: 'Vitinho', minuto: '10:00', penalti: false, contra: false },
      { atletaId: 6, atleta: 'Zé Marcos', minuto: '80:00', penalti: true, contra: false },
    ])
    expect(detail.goals.away).toEqual([
      { atletaId: 7, atleta: 'Guilherme', minuto: '23:00', penalti: false, contra: true },
    ])
    expect(detail.stats.home).toMatchObject({ posse: '52%', finalizacoes: 12, finalizacoesNoGol: 5, passes: 400, passesPrecisao: '81%', desarmes: 14, defesas: 3 })
    expect(detail.lineups.home).toMatchObject({ esquema: '4-3-3', tecnico: 'Marcão' })
    expect(detail.lineups.home.titulares).toEqual([{ atletaId: 5, atleta: 'Vitinho', camisa: '7', posicao: 'Atacante' }])
    expect(detail.lineups.away.reservas).toEqual([])
    expect(detail.referees).toEqual([{ role: 'árbitro', name: 'Raphael Claus' }])
  })

  it('funde por partidaId e NUNCA sobrescreve o que já foi coletado', () => {
    const existing = [{ ...parseMatchDetail(matchPayload), yellowHome: 9 }]
    const merged = mergeMatches(existing, [parseMatchDetail(matchPayload)])
    expect(merged).toHaveLength(1)
    expect(merged[0].yellowHome).toBe(9)
  })

  it('falha sem partida_id', () => {
    expect(() => parseMatchDetail('{}')).toThrow(/sem partida_id/)
  })
})

describe('renderScorersModule', () => {
  it('gera módulo TS com os goleadores e metadados', () => {
    const source = renderScorersModule({ scorers: parseScorers(scorersPayload, { minAthletes: 3 }), fetchedAt: '2026-11-07T12:00:00Z', sourceSha: 'abc' })
    expect(source).toContain("export const scorers2026: readonly Scorer2026[] = [")
    expect(source).toContain("{ name: 'Viveros', club: 'athletico-pr', goals: 21 }")
    expect(source).toContain("fetchedAt: '2026-11-07T12:00:00Z'")
    expect(source).toContain("sha256: 'abc'")
  })

  it('exporta todos os atletas do snapshot local mantendo ranking e provenance', () => {
    const snapshot = JSON.parse(readFileSync('data/source-snapshots/apifb-artilharia-2026.json', 'utf8'))
    const moduleScorers = renderScorersModule({
      scorers: snapshot.scorers,
      fetchedAt: snapshot.fetchedAt,
      sourceSha: snapshot.sha256,
    })
    const sourceSha = createHash('sha256').update(JSON.stringify(snapshot.scorers), 'utf8').digest('hex')

    expect(snapshot.scorers).toHaveLength(305)
    expect(scorers2026).toHaveLength(snapshot.scorers.length)
    expect(scorers2026).toEqual(snapshot.scorers)
    expect(scorers).toHaveLength(snapshot.scorers.length)
    expect(scorers2026[0]).toEqual({ name: 'Viveros', club: 'athletico-pr', goals: 21 })
    expect(scorers2026.at(-1)).toEqual({ name: 'Zé Vitor', club: 'vitoria', goals: 1 })
    expect(scorers.slice(5, 7).map(({ name, position }) => [name, position])).toEqual([
      ['Carlos Vinícius', '6º'],
      ['Luciano Juba', '6º'],
    ])
    expect(scorers2026.every((scorer, index, all) => index === 0 || all[index - 1].goals >= scorer.goals)).toBe(true)
    expect(SCORERS_SOURCE).toMatchObject({
      fetchedAt: '2026-11-07T16:00:24.137Z',
      sha256: sourceSha,
    })
    expect(Date.parse(SCORERS_SOURCE.fetchedAt)).toBeGreaterThan(Date.parse(ANALYTICAL_CUTOFF_UTC))
    expect(moduleScorers.match(/\{ name: /g)).toHaveLength(snapshot.scorers.length)
    expect(readFileSync('src/scorers2026.ts', 'utf8')).toBe(moduleScorers)
    expect(moduleScorers).toContain("fetchedAt: '2026-11-07T16:00:24.137Z'")
    expect(moduleScorers).toContain(`sha256: '${sourceSha}'`)
    expect(moduleScorers).toContain('2026-11-07T16:00:24.137Z')
    expect(moduleScorers).toContain('A cobertura temporal por partida não foi confirmada')
    expect(moduleScorers).toContain('não tratar como')
  })
})
