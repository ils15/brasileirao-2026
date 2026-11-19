/**
 * Agrupamento das partidas pendentes por rodada.
 *
 * Puro e independente do pacote de dados: recebe qualquer lista de partidas com
 * `round` e devolve os grupos ordenados pelo número da rodada e, no empate,
 * pelo sufixo (`"21"` antes de `"21 Adiado"`). A ordenação é numérica — uma
 * rodada adiada entra na posição do seu número, não no fim da lista e não na
 * ordem em que apareceu na entrada. Componente e teste consomem esta mesma
 * função, então nenhum dos dois depende de qual rodada está pendente hoje.
 */
export interface RoundFixture {
  round: string
}

export interface RoundGroup<T extends RoundFixture = RoundFixture> {
  round: string
  roundNumber: number
  suffix: string
  fixtures: T[]
}

/** Agrupa `fixtures` por rodada, ordenando por número e depois por sufixo. */
export function groupPendingRounds<T extends RoundFixture>(fixtures: readonly T[]): RoundGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const fixture of fixtures) {
    const list = groups.get(fixture.round)
    if (list) {
      list.push(fixture)
    } else {
      groups.set(fixture.round, [fixture])
    }
  }
  return [...groups.entries()]
    .map(([round, roundFixtures]) => {
      const [numberPart, ...suffixParts] = round.split(' ')
      return {
        round,
        roundNumber: Number.parseInt(numberPart!, 10),
        suffix: suffixParts.join(' '),
        fixtures: roundFixtures,
      }
    })
    .sort((left, right) => left.roundNumber - right.roundNumber || left.suffix.localeCompare(right.suffix))
}
