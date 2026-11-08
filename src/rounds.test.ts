import { describe, expect, it } from 'vitest'
import { currentSeasonResults, type CurrentSeasonMatch } from './currentSeasonResults'
import { currentClubs, remainingFixtures } from './projectionData'
import { cbfOfficialSchedule } from './cbfOfficialSchedule'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'
import {
  attackDefenseLeaders,
  completedRounds,
  currentStreaks,
  fixtureRefForPair,
  lastNRounds,
  playedRounds,
  positionByRound,
  resultsWithRound,
  standingsFromResults,
} from './rounds'

describe('join resultado ↔ calendário por par ordenado', () => {
  it('casa cada resultado até o corte com exatamente uma rodada e referência CBF', () => {
    const results = resultsWithRound()
    expect(results).toHaveLength(filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).length)
    for (const result of results) {
      expect(result.round).toBeGreaterThanOrEqual(1)
      expect(result.round).toBeLessThanOrEqual(38)
      expect(result.cbfRef).toMatch(/^\d{3}$/)
    }
  })

  it('o par ordenado é único nas 380 tuplas do calendário', () => {
    const pairs = cbfOfficialSchedule.map(([, , home, away]) => `${home}:${away}`)
    expect(new Set(pairs).size).toBe(380)
    expect(fixtureRefForPair('flamengo', 'palmeiras')?.round).toBe(17)
    expect(fixtureRefForPair('palmeiras', 'flamengo')?.round).toBe(36)
  })

  it('resultados com pares fora do calendário são descartados em vez de corromper a rodada', () => {
    const withAlien: CurrentSeasonMatch[] = [
      ...currentSeasonResults,
      { home: 'flamengo', away: 'coritiba', homeGoals: 1, awayGoals: 1, kickoff: '2026-11-01T20:00', source: 'espn', sourceRef: 'alien-test' },
    ]
    expect(resultsWithRound(withAlien)).toHaveLength(resultsWithRound().length)
  })
})

describe('classificações derivadas dos resultados', () => {
  it('reproduz a tabela empacotada (ordem, pontos e totais)', () => {
    const table = standingsFromResults()
    expect(table).toHaveLength(20)
    expect(table.map(({ id }) => id)).toEqual(currentClubs.map(({ id }) => id))
    for (const row of table) {
      const club = currentClubs.find(({ id }) => id === row.id)!
      expect(row.position).toBe(club.position)
      expect(row.points).toBe(club.points)
      expect(row.played).toBe(club.played)
      expect(row.wins).toBe(club.wins)
      expect(row.draws).toBe(club.draws)
      expect(row.losses).toBe(club.losses)
      expect(row.goalsFor).toBe(club.goalsFor)
      expect(row.goalsAgainst).toBe(club.goalsAgainst)
    }
  })

  it('vista de mandantes soma só jogos em casa e a de visitantes só fora', () => {
    const home = standingsFromResults({ venue: 'home' })
    const away = standingsFromResults({ venue: 'away' })
    const playedTotal = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).length
    // Cada vista cobre todas as partidas uma vez (um lado por jogo)
    expect(home.reduce((sum, row) => sum + row.played, 0)).toBe(playedTotal)
    expect(away.reduce((sum, row) => sum + row.played, 0)).toBe(playedTotal)
  })

  it('turno + returno cobrem todos os jogos disputados sem sobreposição', () => {
    const turno = standingsFromResults({ fromRound: 1, toRound: 19 })
    const returno = standingsFromResults({ fromRound: 20 })
    const total = standingsFromResults()
    const playedTotal = total.reduce((sum, row) => sum + row.played, 0)
    expect(turno.reduce((sum, row) => sum + row.played, 0) + returno.reduce((sum, row) => sum + row.played, 0)).toBe(playedTotal)
  })

  it('últimas N rodadas usam apenas as rodadas completas mais recentes', () => {
    const five = lastNRounds(5)
    expect(five).toHaveLength(5)
    const table = standingsFromResults({ rounds: five })
    const totalRounds = new Set(resultsWithRound().map(({ round }) => round))
    for (const round of five) expect(totalRounds.has(round)).toBe(true)
    expect(table.every((row) => row.played <= five.length * 2 + 1)).toBe(true)
  })
})

describe('evolução por rodada', () => {
  it('posições cobrem as rodadas com jogos e terminam na tabela derivada do pacote', () => {
    const evolution = positionByRound()
    expect(evolution.rounds).toEqual(playedRounds())
    expect(evolution.rounds.length).toBeGreaterThan(30)
    expect(evolution.clubs).toHaveLength(20)
    for (const club of evolution.clubs) {
      expect(club.positions).toHaveLength(evolution.rounds.length)
      for (const position of club.positions) {
        expect(position).toBeGreaterThanOrEqual(1)
        expect(position).toBeLessThanOrEqual(20)
      }
      // Último ponto acumula todos os jogos disputados: coincide com a tabela do pacote.
      const packagedRow = currentClubs.find(({ id }) => id === club.id)!
      expect(club.positions.at(-1)).toBe(packagedRow.position)
    }
  })

  it('completedRounds exclui rodadas com jogos pendentes (inclusive adiados)', () => {
    const completed = completedRounds()
    const pendingRounds = new Set(remainingFixtures.map(({ round }) => Number.parseInt(round, 10)))
    for (const round of completed) {
      expect(pendingRounds.has(round)).toBe(false)
      const scheduled = cbfOfficialSchedule.filter(([, roundValue]) => roundValue === round).length
      const played = resultsWithRound().filter(({ round: roundValue }) => roundValue === round).length
      expect(played).toBe(scheduled)
    }
    // Rodadas parciais (21 e 34 têm adiados) não estão entre as completas
    for (const round of pendingRounds) expect(completed).not.toContain(round)
  })
})

describe('sequências e extremos', () => {
  it('sequências vigentes somam os últimos resultados de cada clube', () => {
    const streaks = currentStreaks()
    expect(streaks).toHaveLength(20)
    for (const streak of streaks) {
      // Exatamente um dos três tipos está ativo (ou nenhum, sem jogos)
      expect([streak.wins, streak.draws, streak.losses].filter((count) => count > 0).length).toBeLessThanOrEqual(1)
      // Invicto = sequência de vitórias + empates; sem vitória = empates + derrotas
      if (streak.unbeaten > 0) expect(streak.losses).toBe(0)
      if (streak.winless > 0) expect(streak.wins).toBe(0)
    }
  })

  it('sequências conferem em fixture controlada', () => {
    // Flamengo: V, E, D (nesta ordem cronológica)
    const fixtures: CurrentSeasonMatch[] = [
      { home: 'flamengo', away: 'palmeiras', homeGoals: 3, awayGoals: 0, kickoff: '2026-01-01T20:00Z', source: 'espn', sourceRef: 't1' },
      { home: 'cruzeiro', away: 'flamengo', homeGoals: 1, awayGoals: 1, kickoff: '2026-01-05T20:00Z', source: 'espn', sourceRef: 't2' },
      { home: 'flamengo', away: 'bahia', homeGoals: 0, awayGoals: 2, kickoff: '2026-01-09T20:00Z', source: 'espn', sourceRef: 't3' },
    ]
    const flamengo = currentStreaks(fixtures).find(({ id }) => id === 'flamengo')!
    expect(flamengo).toEqual({ id: 'flamengo', club: 'Flamengo', wins: 0, draws: 0, losses: 1, unbeaten: 0, winless: 2 })
    // Palmeiras perdeu o único jogo: sequência de derrotas
    const palmeiras = currentStreaks(fixtures).find(({ id }) => id === 'palmeiras')!
    expect(palmeiras.losses).toBe(1)
    expect(palmeiras.winless).toBe(1)
  })

  it('aponta líderes de ataque e defesa por jogo entre os disputados', () => {
    const { attack, defense } = attackDefenseLeaders()
    expect(attack.club).toBe('Flamengo')
    expect(attack.goalsPerMatch).toBeGreaterThan(0)
    expect(defense.club).toBe('Palmeiras')
    expect(defense.concededPerMatch).toBeGreaterThanOrEqual(0)
  })
})
