import { describe, expect, it } from 'vitest'
import { groupPendingRounds } from './roundGroups'

/** Fixture sintética local: rodadas e clubes inventados, nada vem do pacote. */
interface SyntheticFixture {
  round: string
  home: string
  away: string
}

const fixtures: SyntheticFixture[] = [
  { round: '36', home: 'time-a', away: 'time-b' },
  // Rodada adiada: aparece no meio do array de propósito, para provar que a
  // ordenação é numérica e não a ordem de inserção.
  { round: '21 Adiado', home: 'time-c', away: 'time-d' },
  { round: '36', home: 'time-e', away: 'time-f' },
  { round: '35', home: 'time-g', away: 'time-h' },
  { round: '21', home: 'time-i', away: 'time-j' },
]

describe('groupPendingRounds', () => {
  it('agrupa as partidas pela rodada preservando todas as partidas do grupo', () => {
    const groups = groupPendingRounds(fixtures)

    expect(groups.map((group) => group.round)).toEqual(['21', '21 Adiado', '35', '36'])
    const round36 = groups.find((group) => group.round === '36')!
    expect(round36.fixtures).toHaveLength(2)
    expect(round36.fixtures.map((fixture) => fixture.home)).toEqual(['time-a', 'time-e'])
    // As partidas continuam sendo os próprios objetos de entrada.
    expect(round36.fixtures[0]).toBe(fixtures[0])
  })

  it('ordena por número da rodada, não pela ordem de entrada', () => {
    const shuffled: SyntheticFixture[] = [
      { round: '38', home: 'a', away: 'b' },
      { round: '9', home: 'c', away: 'd' },
      { round: '30', home: 'e', away: 'f' },
    ]

    expect(groupPendingRounds(shuffled).map((group) => group.roundNumber)).toEqual([9, 30, 38])
  })

  it('desempata o mesmo número pelo sufixo, com a rodada cheia antes da adiada', () => {
    const groups = groupPendingRounds(fixtures)
    const round21 = groups.filter((group) => group.roundNumber === 21)

    expect(round21.map((group) => group.suffix)).toEqual(['', 'Adiado'])
  })

  it('coloca a rodada adiada na posição do seu número, antes das rodadas seguintes', () => {
    const groups = groupPendingRounds(fixtures)

    // Menor número do conjunto; se a adiada fosse jogada para o fim, este teste
    // quebraria mesmo com os dados de entrada intactos.
    expect(groups[0]!.round).toBe('21')
    expect(groups[1]!.round).toBe('21 Adiado')
    expect(groups[1]!.roundNumber).toBeLessThan(groups[2]!.roundNumber)
  })

  it('devolve lista vazia quando não há partidas pendentes', () => {
    expect(groupPendingRounds([])).toEqual([])
  })
})
