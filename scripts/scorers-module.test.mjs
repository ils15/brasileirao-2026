import { describe, expect, it } from 'vitest'

import { currentClubs } from '../src/projectionData'
import { SCORERS_SOURCE, scorers2026 } from '../src/scorers2026'

const clubSlugs = new Set(currentClubs.map((club) => club.id))

describe('módulo gerado src/scorers2026.ts', () => {
  it('expõe exatamente os campos que a UI consome (name, club, goals)', () => {
    expect(scorers2026.length).toBeGreaterThan(0)
    for (const scorer of scorers2026) {
      expect(Object.keys(scorer)).toEqual(['name', 'club', 'goals'])
      expect(typeof scorer.name).toBe('string')
      expect(typeof scorer.goals).toBe('number')
    }
  })

  it('todo clube da artilharia resolvve para um slug da tabela (join de data.ts)', () => {
    const unknown = scorers2026.filter((scorer) => !clubSlugs.has(scorer.club)).map((scorer) => scorer.club)
    expect(unknown).toEqual([])
  })

  it('declara a fonte ESPN e a indisponibilidade de assistências', () => {
    expect(SCORERS_SOURCE.name).toContain('ESPN')
    expect(SCORERS_SOURCE.assists).toBe('unavailable')
    expect(SCORERS_SOURCE.matchesCovered).toBeGreaterThan(0)
  })

  it('não promete mais gols atribuídos do que o pacote contém', () => {
    expect(SCORERS_SOURCE.goalsAttributed).toBeGreaterThan(0)
    expect(SCORERS_SOURCE.goalsAttributed + SCORERS_SOURCE.ownGoals).toBeLessThanOrEqual(
      SCORERS_SOURCE.goalsInPackage,
    )
  })

  it('ordena por gols de forma estritamente descendente', () => {
    for (let index = 1; index < scorers2026.length; index += 1) {
      expect(scorers2026[index - 1].goals).toBeGreaterThanOrEqual(scorers2026[index].goals)
    }
  })
})
