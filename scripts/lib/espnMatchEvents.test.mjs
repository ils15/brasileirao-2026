import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  aggregatePlayerStats,
  compareCardTotals,
  fetchMatchEvents,
  parseMatchEvents,
  parseSeasonScoreboard,
  renderMatchSnapshot,
  renderScorersModule,
} from './espnMatchEvents.mjs'

const ROOT = process.cwd()
const FIXTURE = join(ROOT, 'data/fixtures/espn-summary-401841315.json')
const fixtureText = readFileSync(FIXTURE, 'utf8')
const fixturePayload = JSON.parse(fixtureText)

function syntheticMatch(overrides = {}) {
  return {
    eventId: 'synthetic-1',
    home: 'coritiba',
    away: 'santos',
    homeGoals: 0,
    awayGoals: 0,
    goals: [],
    ownGoals: [],
    cards: [],
    unresolved: [],
    ...overrides,
  }
}

describe('parseMatchEvents — fixture real (Coritiba 0-1 Santos)', () => {
  const parsed = parseMatchEvents(fixtureText)

  it('lê mandante, visitante e placar do header da ESPN', () => {
    expect(parsed.eventId).toBe('401841315')
    expect(parsed.home).toBe('coritiba')
    expect(parsed.away).toBe('santos')
    expect(parsed.homeGoals).toBe(0)
    expect(parsed.awayGoals).toBe(1)
    expect(parsed.status).toBe('post')
  })

  it('extrai o gol com atleta, clube e minuto', () => {
    expect(parsed.goals).toHaveLength(1)
    expect(parsed.goals[0]).toEqual({
      athlete: 'Gabriel Barbosa',
      club: 'santos',
      minute: "90'+2'",
      penalty: false,
    })
  })

  it('extrai os cartões amarelos por atleta e clube', () => {
    expect(parsed.cards).toHaveLength(7)
    expect(parsed.cards.every((card) => card.type === 'yellow')).toBe(true)
    expect(parsed.cards.filter((card) => card.club === 'coritiba')).toHaveLength(5)
    expect(parsed.cards.filter((card) => card.club === 'santos')).toHaveLength(2)
    expect(parsed.cards.map((card) => card.athlete)).toContain('Thiago Santos')
    expect(parsed.cards.find((card) => card.athlete === 'Thiago Santos')?.minute).toBe("14'")
  })

  it('não inventa artilheiro nem cartão para evento sem atleta', () => {
    expect(parsed.unresolved).toEqual([])
    expect(parsed.ownGoals).toEqual([])
  })

  it('os gols dos eventos fecham com o placar do header', () => {
    const eventGoals = parsed.goals.length + parsed.ownGoals.length
    expect(eventGoals).toBe(parsed.homeGoals + parsed.awayGoals)
  })
})

describe('fetchMatchEvents', () => {
  it('monta a URL do summary e parseia a resposta sem rede real', async () => {
    const requested = []
    const fetchImpl = async (url) => {
      requested.push(url)
      return { ok: true, status: 200, text: async () => fixtureText }
    }

    const parsed = await fetchMatchEvents('401841315', { fetchImpl })

    expect(requested).toEqual([
      'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=401841315',
    ])
    expect(parsed.goals).toHaveLength(1)
  })

  it('falha alto quando o endpoint responde erro', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => '' })
    await expect(fetchMatchEvents('999', { fetchImpl })).rejects.toThrow(/HTTP 429/)
  })
})

describe('tolerância do parser', () => {
  it('conta gol sem atleta em unresolved e não cria artilheiro', () => {
    const payload = {
      ...fixturePayload,
      keyEvents: [
        { type: { text: 'Goal', type: 'goal' }, team: { displayName: 'Santos' }, clock: { displayValue: "70'" }, text: 'Goal!' },
      ],
    }
    const parsed = parseMatchEvents(payload)
    expect(parsed.goals).toEqual([])
    expect(parsed.unresolved).toEqual([{ kind: 'goal', reason: 'no-athlete', text: 'Goal!' }])
  })

  it('separa gol contra do artilheiro e conta o placar pelo evento', () => {
    const payload = {
      ...fixturePayload,
      keyEvents: [
        {
          type: { text: 'Own Goal', type: 'own-goal' },
          participants: [{ athlete: { displayName: 'Zagueiro' } }],
          team: { displayName: 'Santos' },
          clock: { displayValue: "80'" },
          text: 'Own Goal by Zagueiro, Coritiba.',
        },
      ],
    }
    const parsed = parseMatchEvents(payload)
    expect(parsed.goals).toEqual([])
    expect(parsed.ownGoals).toEqual([{ athlete: 'Zagueiro', club: 'santos', minute: "80'" }])
  })

  it('conta cabeceio/penálti pelo prefixo goal--- sem confundir com outras jogadas', () => {
    const payload = {
      ...fixturePayload,
      keyEvents: [
        {
          type: { text: 'Goal - Header', type: 'goal---header' },
          participants: [{ athlete: { displayName: 'José López' } }],
          team: { displayName: 'Palmeiras' },
          clock: { displayValue: "27'" },
          text: 'Goal! ... José López (Palmeiras) header from very close range.',
        },
        {
          type: { text: 'Goal Kick', type: 'goal-kick' },
          team: { displayName: 'Santos' },
          clock: { displayValue: "30'" },
        },
        {
          type: { text: 'Penalty - Saved', type: 'penalty---saved' },
          participants: [{ athlete: { displayName: 'Pedro' } }],
          team: { displayName: 'Flamengo' },
          clock: { displayValue: "40'" },
        },
      ],
    }
    const parsed = parseMatchEvents(payload)
    expect(parsed.goals).toEqual([{ athlete: 'José López', club: 'palmeiras', minute: "27'", penalty: false }])
    expect(parsed.unresolved).toEqual([])
  })

  it('conta o pênalti convertido (penalty---scored) como gol com penalty=true', () => {
    const payload = {
      ...fixturePayload,
      keyEvents: [
        {
          type: { text: 'Penalty - Scored', type: 'penalty---scored' },
          participants: [{ athlete: { displayName: 'Walter Clar' } }],
          team: { displayName: 'Chapecoense' },
          clock: { displayValue: "18'" },
          text: 'Goal! Chapecoense 1, Santos 0. Walter Clar (Chapecoense) converts the penalty with a left footed shot.',
        },
      ],
    }
    const parsed = parseMatchEvents(payload)
    expect(parsed.goals).toEqual([{ athlete: 'Walter Clar', club: 'chapecoense', minute: "18'", penalty: true }])
  })

  it('reconhece gol contra também quando o tipo vem como goal---own-goal', () => {
    const payload = {
      ...fixturePayload,
      keyEvents: [
        {
          type: { text: 'Own Goal', type: 'goal---own-goal' },
          participants: [{ athlete: { displayName: 'Khellven' } }],
          team: { displayName: 'Atlético-MG' },
          clock: { displayValue: "74'" },
          text: 'Own Goal by Khellven, Palmeiras.',
        },
      ],
    }
    const parsed = parseMatchEvents(payload)
    expect(parsed.goals).toEqual([])
    expect(parsed.ownGoals).toEqual([{ athlete: 'Khellven', club: 'atletico-mg', minute: "74'" }])
  })

  it('trata segundo amarelo como vermelho', () => {
    const payload = {
      ...fixturePayload,
      keyEvents: [
        {
          type: { text: 'Second Yellow Card', type: 'yellow-red-card' },
          participants: [{ athlete: { displayName: 'Rodinei' } }],
          team: { displayName: 'Santos' },
          clock: { displayValue: "88'" },
        },
      ],
    }
    const parsed = parseMatchEvents(payload)
    expect(parsed.cards).toEqual([{ athlete: 'Rodinei', club: 'santos', type: 'red', minute: "88'" }])
  })

  it('ignora eventos que não são gol nem cartão', () => {
    const parsed = parseMatchEvents({
      ...fixturePayload,
      keyEvents: fixturePayload.keyEvents.filter((event) => event.type.text === 'Substitution'),
    })
    expect(parsed.goals).toEqual([])
    expect(parsed.cards).toEqual([])
  })
})

describe('aggregatePlayerStats', () => {
  const first = syntheticMatch({
    eventId: 'event-1',
    homeGoals: 2,
    awayGoals: 1,
    goals: [
      { athlete: 'Gabriel Barbosa', club: 'santos', minute: "10'", penalty: false },
      { athlete: 'Gabriel Barbosa', club: 'santos', minute: "55'", penalty: true },
      { athlete: 'Pedro Rocha', club: 'coritiba', minute: "70'", penalty: false },
    ],
    cards: [
      { athlete: 'Jacy', club: 'coritiba', type: 'yellow', minute: "20'" },
      { athlete: 'Rodinei', club: 'santos', type: 'yellow', minute: "30'" },
      { athlete: 'Rodinei', club: 'santos', type: 'red', minute: "80'" },
    ],
  })
  const second = syntheticMatch({
    eventId: 'event-2',
    home: 'flamengo',
    away: 'coritiba',
    homeGoals: 1,
    awayGoals: 2,
    goals: [
      { athlete: 'Gabriel Barbosa', club: 'flamengo', minute: "12'", penalty: false },
      { athlete: 'Pedro Rocha', club: 'coritiba', minute: "90'", penalty: false },
      { athlete: 'Jacy', club: 'coritiba', minute: "90'+4'", penalty: false },
    ],
    cards: [
      { athlete: 'Jacy', club: 'coritiba', type: 'yellow', minute: "45'" },
      { athlete: 'Gabriel Barbosa', club: 'flamengo', type: 'yellow', minute: "60'" },
    ],
  })

  it('soma gols por atleta e mantém o mesmo nome em clubes diferentes', () => {
    const { scorers } = aggregatePlayerStats([first, second])
    expect(scorers).toEqual([
      { player: 'Gabriel Barbosa', club: 'santos', goals: 2 },
      { player: 'Pedro Rocha', club: 'coritiba', goals: 2 },
      { player: 'Gabriel Barbosa', club: 'flamengo', goals: 1 },
      { player: 'Jacy', club: 'coritiba', goals: 1 },
    ])
    expect(scorers.filter((row) => row.player === 'Gabriel Barbosa')).toHaveLength(2)
    expect(scorers.find((row) => row.player === 'Gabriel Barbosa' && row.club === 'flamengo')?.goals).toBe(1)
    expect(scorers.find((row) => row.player === 'Gabriel Barbosa' && row.club === 'santos')?.goals).toBe(2)
  })

  it('soma cartões por atleta e ordena por total', () => {
    const { discipline } = aggregatePlayerStats([first, second])
    expect(discipline.find((row) => row.player === 'Jacy')).toEqual({
      player: 'Jacy',
      club: 'coritiba',
      yellow: 2,
      red: 0,
    })
    expect(discipline.find((row) => row.player === 'Rodinei')).toEqual({
      player: 'Rodinei',
      club: 'santos',
      yellow: 1,
      red: 1,
    })
    // Empate no total (2 cartões) desempata por vermelhos.
    expect(discipline.map((row) => row.player)).toEqual(['Rodinei', 'Jacy', 'Gabriel Barbosa'])
  })

  it('declara cobertura e sinaliza partida cujo evento não fecha com o placar', () => {
    const incomplete = syntheticMatch({ eventId: 'event-3', homeGoals: 2, awayGoals: 0, goals: [] })
    const { coverage } = aggregatePlayerStats([first, second, incomplete])
    expect(coverage.matchesCovered).toBe(3)
    expect(coverage.goalsInPackage).toBe(8)
    expect(coverage.goalsAttributed).toBe(6)
    expect(coverage.mismatchedMatches).toEqual(['event-3'])
  })
})

describe('parseSeasonScoreboard', () => {
  it('indexa o par ordenado com placar e eventId', () => {
    const byPair = parseSeasonScoreboard({
      events: [
        {
          id: '401841315',
          date: '2026-11-18T22:30Z',
          status: { type: { state: 'post', completed: true } },
          competitions: [
            {
              id: '401841315',
              date: '2026-11-18T22:30Z',
              status: { type: { state: 'post', completed: true } },
              competitors: [
                { homeAway: 'home', score: '0', team: { displayName: 'Coritiba' } },
                { homeAway: 'away', score: '1', team: { displayName: 'Santos' } },
              ],
            },
          ],
        },
      ],
    })
    expect(byPair.get('coritiba:santos')).toEqual([
      { eventId: '401841315', date: '2026-11-18T22:30Z', homeScore: 0, awayScore: 1, completed: true },
    ])
  })

  it('resolve o alias do scoreboard ("Athletico-PR") para o slug do projeto', () => {
    const byPair = parseSeasonScoreboard({
      events: [
        {
          id: '401840814',
          competitions: [
            {
              id: '401840814',
              status: { type: { state: 'post', completed: true } },
              competitors: [
                { homeAway: 'home', score: '0', team: { displayName: 'Internacional' } },
                { homeAway: 'away', score: '1', team: { displayName: 'Athletico-PR' } },
              ],
            },
          ],
        },
      ],
    })
    expect(byPair.get('internacional:athletico-pr')?.[0].eventId).toBe('401840814')
  })
})

describe('renderMatchSnapshot', () => {
  it('preserva procedência por partida e não inclui payload cru', () => {
    const parsed = parseMatchEvents(fixtureText)
    const snapshot = renderMatchSnapshot(parsed, { fetchedAt: 'instante-da-captura' })
    expect(Object.keys(snapshot).sort()).toEqual([
      'away',
      'awayGoals',
      'cards',
      'date',
      'endpoint',
      'eventId',
      'fetchedAt',
      'goals',
      'home',
      'homeGoals',
      'ownGoals',
      'source',
      'status',
      'unresolved',
    ])
    expect(snapshot.source).toBe('ESPN')
    expect(snapshot.goals).toHaveLength(1)
    expect(snapshot).not.toHaveProperty('commentary')
    expect(snapshot).not.toHaveProperty('boxscore')
  })
})

describe('compareCardTotals — corroboração com a 365scores', () => {
  it('compara só partidas presentes nos dois lados', () => {
    const match = syntheticMatch({
      eventId: 'event-1',
      cards: [
        { athlete: 'A', club: 'coritiba', type: 'yellow', minute: "10'" },
        { athlete: 'B', club: 'santos', type: 'red', minute: "20'" },
      ],
    })
    const result = compareCardTotals([match, syntheticMatch({ eventId: 'event-x', home: 'bahia', away: 'vasco' })], [
      { home: 'coritiba', away: 'santos', yellowHome: 3, yellowAway: 0, redHome: 0, redAway: 1 },
    ])
    expect(result.compared).toBe(1)
    expect(result.rows[0].eventId).toBe('event-1')
    expect(result.yellowDelta).toBe(2)
  })
})

describe('renderScorersModule — shape consumido pela UI', () => {
  const coverage = { matchesCovered: 2, goalsInPackage: 4, goalsAttributed: 4, ownGoals: 0, unresolved: 0 }
  const moduleText = renderScorersModule({
    scorers: [
      { player: "Gabriel Barbosa", club: 'santos', goals: 2 },
      { player: 'Pedro Rocha', club: 'coritiba', goals: 1 },
    ],
    fetchedAt: 'instante-da-captura',
    sourceSha: 'sha-de-teste',
    coverage,
  })

  it('declara fonte ESPN, indisponibilidade de assistências e cobertura', () => {
    expect(moduleText).toContain("name: 'ESPN (eventos de partida)'")
    expect(moduleText).toContain("assists: 'unavailable'")
    expect(moduleText).toContain('matchesCovered: 2')
    expect(moduleText).toContain('goalsAttributed: 4')
  })

  it('emite exatamente os campos name/club/goals do tipo Scorer2026', () => {
    expect(moduleText).toContain(`  { name: 'Gabriel Barbosa', club: 'santos', goals: 2 },`)
    expect(moduleText).toMatch(/export interface Scorer2026 \{\n {2}name: string\n {2}club: string\n {2}goals: number\n\}/)
  })

  it('escapa apóstrofo e barra invertida no nome do atleta', () => {
    const escaped = renderScorersModule({
      scorers: [{ player: "D'Alessandro\\Teste", club: 'santos', goals: 1 }],
      fetchedAt: 'instante-da-captura',
      sourceSha: 'sha-de-teste',
      coverage,
    })
    expect(escaped).toContain(`  { name: 'D\\'Alessandro\\\\Teste', club: 'santos', goals: 1 },`)
  })
})
