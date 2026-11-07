import { describe, expect, it } from 'vitest'
import {
  mergeMatches,
  parseMatchCards,
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
  cartoes: {
    amarelo: { mandante: [{ cartao_id: 1 }, { cartao_id: 2 }], visitante: [{ cartao_id: 3 }] },
    vermelho: { mandante: [], visitante: [{ cartao_id: 9 }] },
  },
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

describe('parseMatchCards e mergeMatches', () => {
  it('extrai cartões por clube e placar da partida', () => {
    expect(parseMatchCards(matchPayload)).toEqual({
      partidaId: 27979,
      home: 'bragantino',
      away: 'santos',
      homeGoals: 2,
      awayGoals: 1,
      yellowHome: 2,
      yellowAway: 1,
      redHome: 0,
      redAway: 1,
    })
  })

  it('funde por partidaId e NUNCA sobrescreve o que já foi coletado', () => {
    const existing = [{ ...parseMatchCards(matchPayload), yellowHome: 9 }]
    const merged = mergeMatches(existing, [parseMatchCards(matchPayload)])
    expect(merged).toHaveLength(1)
    expect(merged[0].yellowHome).toBe(9)
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
})
