/**
 * Gerador de `docs/atualizacoes.md`: cabeçalho e fechamento derivam do pacote
 * (`generatedAt`, resultados, pendentes) — nenhuma data ou contagem é literal.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURRENT_SEASON_PACK_GENERATED_AT } from '../../src/currentSeasonResults.ts'
import {
  renderUpdateLog,
  renderUpdateLogEntry,
  renderUpdateLogHeader,
  updateLogTotals,
} from './updateLog.mjs'

const added = [
  { home: 'a', away: 'b', homeGoals: 2, awayGoals: 1, source: 'espn', sourceRef: '401800001' },
  { home: 'c', away: 'd', homeGoals: 0, awayGoals: 0, source: 'football-data', sourceRef: 'csv-line-1' },
]
const remaining = [
  { round: '7', home: 'e', away: 'f', cbfRef: '001' },
  { round: '3 adiado', home: 'g', away: 'h', cbfRef: '002' },
]
const results = [
  { home: 'a', away: 'b' },
  { home: 'c', away: 'd' },
  { home: 'i', away: 'j' },
  { home: 'k', away: 'l' },
  { home: 'm', away: 'n' },
]
const totals = updateLogTotals({
  results,
  remaining,
  addedCount: added.length,
  scheduleLength: results.length + remaining.length,
})
const packGeneratedAt = '2026-01-02T03:04:05.678Z'
const entry = { date: '2026-01-02', added, generatedAt: packGeneratedAt, totals }

describe('renderUpdateLogHeader', () => {
  it('deriva o instante do cabeçalho do pacote, não de literal', () => {
    const otherPack = '2026-02-03T04:05:06.789Z'
    const first = renderUpdateLogHeader({ generatedAt: packGeneratedAt })
    const second = renderUpdateLogHeader({ generatedAt: otherPack })
    expect(first).toContain(packGeneratedAt)
    expect(second).toContain(otherPack)
    expect(first).not.toEqual(second)
  })

  it('cabeçalho publicado no repositório mostra o instante do pacote atual', () => {
    const header = renderUpdateLogHeader({ generatedAt: CURRENT_SEASON_PACK_GENERATED_AT })
    expect(header).toContain(CURRENT_SEASON_PACK_GENERATED_AT)
    const published = readFileSync('docs/atualizacoes.md', 'utf8')
      .split('\n')
      .find((line) => line.startsWith('Cada entrada'))
    expect(published).toBe(header)
  })
})

describe('renderUpdateLogEntry', () => {
  it('fecha com corte, contagem de disputados/pendentes e adiados', () => {
    const text = renderUpdateLogEntry(entry)
    expect(text).toContain('## 2026-01-02 — 2 novo(s) resultado(s)')
    expect(text).toContain('- a 2–1 b (espn, 401800001)')
    expect(text).toContain('Corte do pacote:')
    expect(text).toContain(`${totals.resultsBefore} → ${totals.resultsAfter}`)
    expect(text).toContain(`${totals.pendingBefore} → ${totals.pendingAfter}`)
    expect(text).toContain(`${totals.postponed} adiado(s)`)
    expect(text).toContain(`${totals.scheduleLength} do calendário CBF`)
  })

  it('recusa entrada sem resultado novo (o log só registra execução que publica)', () => {
    expect(() => renderUpdateLogEntry({ ...entry, added: [] })).toThrow(/ao menos um resultado novo/)
  })
})

describe('updateLogTotals', () => {
  it('recusa contagem que não fecha com o calendário', () => {
    expect(() => updateLogTotals({ results, remaining, addedCount: 2, scheduleLength: results.length + remaining.length - 1 }))
      .toThrow(/calendário/)
  })
})

describe('renderUpdateLog', () => {
  it('é determinístico para o mesmo estado', () => {
    expect(renderUpdateLog({ previous: null, entry })).toBe(renderUpdateLog({ previous: null, entry }))
  })

  it('preserva entradas anteriores e atualiza o cabeçalho do pacote', () => {
    const previous = '# Log de atualizações automáticas\n\nCabeçalho antigo.\n\n## 2026-01-01 — 1 novo(s) resultado(s)\n\n- x 1–0 y (espn, 1)\n\nAnotação histórica preservada.\n\n## 2026-01-01b — 1 novo(s) resultado(s)\n\n- z 2–0 w (espn, 2)\n'
    const output = renderUpdateLog({ previous, entry })
    expect(output).toContain('Anotação histórica preservada.')
    expect(output).not.toContain('Cabeçalho antigo.')
    expect(output).toContain(renderUpdateLogHeader({ generatedAt: packGeneratedAt }))
    expect(output).toContain('## 2026-01-01 — 1 novo(s) resultado(s)')
    expect(output).toContain('## 2026-01-01b — 1 novo(s) resultado(s)')
    expect(output.match(/^## /gm)).toHaveLength(3)
  })

  it('replaceLast corrige a última entrada sem duplicar o título', () => {
    const previousEntry = {
      ...entry,
      date: '2026-01-01',
      added: [added[0]],
      totals: updateLogTotals({
        results: results.slice(0, 4),
        remaining: [...remaining, { round: '4', home: 'o', away: 'p', cbfRef: '003' }],
        addedCount: 1,
        scheduleLength: results.length + remaining.length,
      }),
    }
    const previous = renderUpdateLog({ previous: null, entry: previousEntry })
    const repaired = renderUpdateLog({ previous, entry, replaceLast: true })
    expect(repaired.match(/^## /gm)).toHaveLength(1)
    expect(repaired).toContain('## 2026-01-02')
    expect(repaired).not.toContain('## 2026-01-01')
  })
})
