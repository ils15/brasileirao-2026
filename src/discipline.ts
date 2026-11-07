import { advancedMatches, type AdvancedMatchRecord } from './advancedStats2026'
import { remainingFixtures, currentClubs } from './projectionData'

/**
 * Disciplina por clube: cartões reais (fonte 365scores) e a projeção para os
 * jogos restantes, usada nos critérios 5/6 do Art. 15 do REC 2026
 * (menor número de cartões vermelhos, depois amarelos).
 *
 * A projeção é determinística: cartões reais + taxa por jogo da temporada
 * × jogos restantes. Cartões não são simulados jogo a jogo — o regulamento
 * só os usa para desempatar, então a taxa média do clube é a estimativa
 * honesta disponível.
 */

export interface DisciplineRow {
  clubId: string
  /** Cartões reais até o corte (nos jogos com cobertura da fonte). */
  yellows: number
  reds: number
  /** Jogos do clube presentes na fonte avançada (denominador das taxas). */
  matchesCovered: number
  yellowRate: number
  redRate: number
  /** Jogos restantes do clube no calendário CBF (38 − disputados). */
  remaining: number
  /** Projeção para o fim da temporada = reais + taxa × restantes. */
  projectedYellows: number
  projectedReds: number
}

export type DisciplineTable = ReadonlyMap<string, DisciplineRow>

export function disciplineTable(
  matches: readonly AdvancedMatchRecord[] = advancedMatches,
  remaining: readonly { home: string; away: string }[] = remainingFixtures,
  clubIds: readonly string[] = currentClubs.map(({ id }) => id),
): DisciplineTable {
  const totals = new Map<string, { yellows: number; reds: number; matches: number }>()
  for (const clubId of clubIds) totals.set(clubId, { yellows: 0, reds: 0, matches: 0 })
  for (const record of matches) {
    for (const [clubId, yellows, reds] of [
      [record.home, record.yellowHome, record.redHome],
      [record.away, record.yellowAway, record.redAway],
    ] as const) {
      const entry = totals.get(clubId)
      if (!entry) continue
      entry.yellows += yellows
      entry.reds += reds
      entry.matches += 1
    }
  }
  const remainingByClub = new Map<string, number>()
  for (const clubId of clubIds) remainingByClub.set(clubId, 0)
  for (const fixture of remaining) {
    if (remainingByClub.has(fixture.home)) remainingByClub.set(fixture.home, remainingByClub.get(fixture.home)! + 1)
    if (remainingByClub.has(fixture.away)) remainingByClub.set(fixture.away, remainingByClub.get(fixture.away)! + 1)
  }
  const table = new Map<string, DisciplineRow>()
  for (const clubId of clubIds) {
    const entry = totals.get(clubId)!
    const matchesCovered = entry.matches
    const remaining = remainingByClub.get(clubId) ?? 0
    const yellowRate = matchesCovered > 0 ? entry.yellows / matchesCovered : 0
    const redRate = matchesCovered > 0 ? entry.reds / matchesCovered : 0
    table.set(clubId, {
      clubId,
      yellows: entry.yellows,
      reds: entry.reds,
      matchesCovered,
      yellowRate,
      redRate,
      remaining,
      projectedYellows: entry.yellows + yellowRate * remaining,
      projectedReds: entry.reds + redRate * remaining,
    })
  }
  return table
}

/**
 * Desempate disciplinar (Art. 15, itens 5 e 6): menos vermelhos ganha;
 * empatados, menos amarelos; ainda empatados, 0 (cai para o sorteio no chamador).
 */
export function disciplineTiebreak(table: DisciplineTable, clubA: string, clubB: string): number {
  const a = table.get(clubA)
  const b = table.get(clubB)
  if (!a || !b) return 0
  if (a.projectedReds !== b.projectedReds) return a.projectedReds < b.projectedReds ? -1 : 1
  if (a.projectedYellows !== b.projectedYellows) return a.projectedYellows < b.projectedYellows ? -1 : 1
  return 0
}
