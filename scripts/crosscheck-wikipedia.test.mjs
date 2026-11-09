import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canonicalFixtureIdentity,
  crosscheckAll,
  crosscheckSeason,
  fixtureKey,
  loadSidecar,
  renderConflicts,
  renderReport,
  SIDECAR_DIR,
} from './crosscheck-wikipedia.mjs'
import { historicalSeasons } from '../src/historicalSeasons.ts'

const bundle = crosscheckAll()
const byYear = new Map(bundle.results.map((result) => [result.year, result]))

function canonicalMatch(overrides) {
  return {
    round: 1,
    date: '2005-04-23',
    home: 'corinthians',
    away: 'santos',
    homeGoals: 1,
    awayGoals: 0,
    kickoff: '2005-04-23T00:00',
    sourceOrdinal: 1,
    ...overrides,
  }
}

function sidecarDocument({ status = 'corroborated', matches = [] }) {
  return {
    season: 2005,
    status,
    statusReason: null,
    matches,
    validation: {},
    provenance: {
      article: '2005 Campeonato Brasileiro Série A',
      oldid: 1381069893,
      permalink: 'https://en.wikipedia.org/w/index.php?oldid=1381069893',
      license: 'CC-BY-SA-4.0',
      retrieved_at: '2026-11-09T00:00:00.000Z',
      modifications: [],
    },
  }
}

describe('sidecar de corroboração', () => {
  it('cobre 2003–2011 e mantém 2003 fora do cross-check', () => {
    const { seasons } = loadSidecar()
    expect([...seasons.keys()]).toEqual([2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011])
    expect(seasons.get(2003).status).toBe('not_corroborated')
    expect(seasons.get(2003).matches).toEqual([])
    for (const year of [2004, 2005, 2008]) {
      expect(seasons.get(year).status, `temporada ${year}`).toBe('corroboration_unavailable')
      expect(seasons.get(year).matches).toEqual([])
    }
    for (const year of [2006, 2007, 2009, 2010, 2011]) {
      expect(seasons.get(year).status, `temporada ${year}`).toBe('corroborated')
      expect(seasons.get(year).matches.length, `temporada ${year}`).toBe(380)
      expect(Number.isInteger(seasons.get(year).provenance.oldid), `oldid ${year}`).toBe(true)
    }
    expect(byYear.get(2003).compared).toBe(0)
    expect(byYear.get(2003).divergences).toEqual([])
  })

  it('rejeita sidecar alterado mesmo quando o manifest é mantido', () => {
    const dir = mkdtempSync('/tmp/opencode/corroboration-')
    try {
      cpSync(SIDECAR_DIR, dir, { recursive: true })
      const file = join(dir, '2006.json')
      const document = JSON.parse(readFileSync(file, 'utf8'))
      document.matches[0].homeGoals += 1
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`)
      expect(() => loadSidecar(dir)).toThrow(/diverge do manifest/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('é determinístico entre execuções', () => {
    const again = crosscheckAll()
    expect(renderReport(again)).toBe(renderReport(bundle))
    expect(JSON.stringify(renderConflicts(again))).toBe(JSON.stringify(renderConflicts(bundle)))
  })

  it('preserva as contagens de coincidências e divergências por temporada', () => {
    const expected = new Map([
      [2006, { compared: 380, divergences: 2 }],
      [2007, { compared: 380, divergences: 6 }],
      [2009, { compared: 378, divergences: 1, ambiguities: 2 }],
      [2010, { compared: 380, divergences: 0 }],
      [2011, { compared: 380, divergences: 0 }],
    ])
    for (const [year, counts] of expected) {
      const result = byYear.get(year)
      expect(result.compared, `comparadas ${year}`).toBe(counts.compared)
      expect(result.divergences.length, `divergências ${year}`).toBe(counts.divergences)
      if (counts.ambiguities != null) expect(result.ambiguities.length, `ambiguidades ${year}`).toBe(counts.ambiguities)
    }
    expect(bundle.results.reduce((sum, result) => sum + result.divergences.length, 0)).toBe(9)
  })

  it('nunca deixa um placar exclusivo da Wikipédia entrar no pacote canônico', () => {
    const allDivergences = bundle.results.flatMap((result) => result.divergences)
    expect(allDivergences.length).toBeGreaterThan(0)
    for (const divergence of allDivergences) {
      const season = historicalSeasons.find((candidate) => candidate.year === divergence.season)
      expect(season, `temporada ${divergence.season}`).toBeTruthy()
      expect(season.provenance?.source).toBe('OpenFootball')
      const teamIds = season.teamIds
      const fixtures = season.matches.filter(([home, away]) =>
        teamIds[home] === divergence.fixture.home && teamIds[away] === divergence.fixture.away)
      expect(fixtures, `fixture ${divergence.id}`).toHaveLength(1)
      const [, , homeGoals, awayGoals] = fixtures[0]
      expect({ homeGoals, awayGoals }, `canônico de ${divergence.id}`).toEqual(divergence.openfootball)
      expect({ homeGoals, awayGoals }, `placar da Wikipédia em ${divergence.id}`).not.toEqual({
        homeGoals: divergence.wikipedia.homeGoals,
        awayGoals: divergence.wikipedia.awayGoals,
      })
    }
  })

  it('mantém a camada de corroboração fora do pacote gerado', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/historicalSeasons.ts'), 'utf8')
    expect(source).not.toMatch(/wikipedia|corroboration/i)
    expect(source).not.toMatch(/oldid/i)
  })
})

describe('identidade de fixture e replays', () => {
  it('trata replays de 2005 como fixtures distintos e reporta ambiguidade sem deduplicar', () => {
    const canonical = [
      canonicalMatch({ home: 'corinthians', away: 'santos', homeGoals: 1, awayGoals: 0, round: 1, sourceOrdinal: 1 }),
      canonicalMatch({ home: 'santos', away: 'corinthians', homeGoals: 2, awayGoals: 2, round: 2, sourceOrdinal: 2 }),
      canonicalMatch({ home: 'corinthians', away: 'santos', homeGoals: 0, awayGoals: 3, round: 9, sourceOrdinal: 3 }),
    ]
    expect(canonicalFixtureIdentity(2005, canonical[0])).not.toBe(canonicalFixtureIdentity(2005, canonical[2]))
    expect(fixtureKey(2005, canonical[0])).toBe(fixtureKey(2005, canonical[2]))

    const result = crosscheckSeason(2005, canonical, sidecarDocument({
      matches: [{ home: 'corinthians', away: 'santos', homeGoals: 1, awayGoals: 0, round: null }],
    }))

    expect(result.compared).toBe(0)
    expect(result.divergences).toEqual([])
    expect(result.ambiguities).toHaveLength(1)
    expect(result.ambiguities[0].candidates.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual([1, 3])
    expect(result.onlyOpenFootball.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual([2])
  })

  it('compara normalmente quando a direção do mando é única', () => {
    const canonical = [canonicalMatch({ home: 'corinthians', away: 'santos', homeGoals: 1, awayGoals: 0 })]
    const result = crosscheckSeason(2005, canonical, sidecarDocument({
      matches: [{ home: 'corinthians', away: 'santos', homeGoals: 1, awayGoals: 0, round: null }],
    }))
    expect(result.compared).toBe(1)
    expect(result.coincidences).toHaveLength(1)
    expect(result.divergences).toEqual([])
  })

  it('reporta divergência de mando como ambiguidade, sem escolher valor', () => {
    const canonical = [canonicalMatch({ home: 'corinthians', away: 'santos', homeGoals: 1, awayGoals: 0 })]
    const result = crosscheckSeason(2005, canonical, sidecarDocument({
      matches: [{ home: 'santos', away: 'corinthians', homeGoals: 2, awayGoals: 2, round: null }],
    }))
    expect(result.compared).toBe(0)
    expect(result.divergences).toEqual([])
    expect(result.ambiguities[0].kind).toBe('venue_mismatch')
  })
})

describe('política de conflito', () => {
  it('mantém todos os conflitos abertos, sem resolução automática e com evidência', () => {
    const conflicts = renderConflicts(bundle)
    expect(conflicts.totals.conflicts).toBe(9)
    expect(conflicts.totals.open).toBe(9)
    expect(conflicts.totals.resolved).toBe(0)
    for (const conflict of conflicts.conflicts) {
      expect(conflict.status).toBe('open')
      expect(conflict.resolution).toBeNull()
      expect(conflict.evidence.length).toBeGreaterThanOrEqual(2)
      expect(conflict.evidence.join(' ')).toContain(String(conflict.wikipedia.oldid))
    }
    expect(conflicts.secondary.consumedByRuntime).toBe(false)
  })
})
