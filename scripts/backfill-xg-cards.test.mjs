/**
 * Roundtrip do snapshot de dados avançados (365scores): o snapshot legado não
 * tinha `seasonNum` por registro e o backfill o removia ao gravar, então o
 * filtro da temporada corrente descartava tudo e `validateAdvancedStats`
 * abortava por contagem. Aqui o arquivo é temporário — nada toca
 * `data/source-snapshots/`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readExisting } from './backfill-xg-cards.mjs'
import { filterCurrentSeason, mergeAdvancedStats, renderAdvancedStatsModule, validateAdvancedStats } from './lib/threesixfive.mjs'

// Fixture sintética: mesma forma dos registros legados (sem `seasonNum`).
const SEASON = 76
const legacyRecords = () => [
  { gameId: 5001, roundNum: 1, home: 'flamengo', away: 'palmeiras', homeScore: 2, awayScore: 0, hasXg: true, xgHome: 1.4, xgAway: 0.7, shotsHome: 8, shotsAway: 5, yellowHome: 2, yellowAway: 1, redHome: 0, redAway: 0 },
  { gameId: 5002, roundNum: 1, home: 'corinthians', away: 'santos', homeScore: 1, awayScore: 1, hasXg: true, xgHome: 0.9, xgAway: 1.2, shotsHome: 6, shotsAway: 7, yellowHome: 1, yellowAway: 3, redHome: 0, redAway: 1 },
]
const freshRecord = { gameId: 5003, seasonNum: SEASON, roundNum: 2, home: 'gremio', away: 'vasco', homeScore: 1, awayScore: 0, hasXg: true, xgHome: 0.8, xgAway: 0.4, shotsHome: 5, shotsAway: 4, yellowHome: 1, yellowAway: 2, redHome: 0, redAway: 0 }

function writeSnapshotAt(path, records, seasonNum = SEASON) {
  const snapshot = { source: '365scores', seasonNum, fetchedAt: '2026-11-07T12:00:00Z', sha256: 'legado', records }
  writeFileSync(path, JSON.stringify(snapshot, null, 1) + '\n')
}

function writeSnapshot(records, seasonNum = SEASON) {
  const dir = mkdtempSync(join(tmpdir(), 'advanced-stats-'))
  const path = join(dir, 'advanced-stats-2026.json')
  writeSnapshotAt(path, records, seasonNum)
  return { dir, path }
}

describe('readExisting', () => {
  it('carimba nos registros legados o seasonNum declarado no topo do snapshot', () => {
    const legacy = legacyRecords()
    const { dir, path } = writeSnapshot(legacy)
    try {
      const existing = readExisting(path)
      expect(existing).toHaveLength(legacy.length)
      expect(existing.map((record) => record.seasonNum)).toEqual(legacy.map(() => SEASON))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('roundtrip: ler legado → merge → validar → regravar preservando seasonNum', () => {
    const legacy = legacyRecords()
    const { dir, path } = writeSnapshot(legacy)
    try {
      const merged = mergeAdvancedStats(readExisting(path), [freshRecord])
      const current = filterCurrentSeason(merged, SEASON)
      expect(current).toHaveLength(legacy.length + 1)
      const validation = validateAdvancedStats(current, { expectedMatches: current.length })
      expect(validation.matches).toBe(legacy.length + 1)

      // Regravação como o backfill passou a fazer: snapshot auto-descritivo.
      writeSnapshotAt(path, current)
      const reread = readExisting(path)
      expect(reread).toHaveLength(current.length)
      expect(reread.every((record) => record.seasonNum === SEASON)).toBe(true)

      // O formato do módulo gerado não muda: `seasonNum` só aparece no topo.
      const moduleSource = renderAdvancedStatsModule({ records: reread, fetchedAt: '2026-11-07T12:00:00Z', sourceSha: 'abc123', seasonNum: SEASON })
      const recordLine = moduleSource.split('\n').find((line) => line.trim().startsWith('{ gameId'))
      expect(recordLine).not.toContain('seasonNum')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('snapshot com registros e sem seasonNum no topo falha alto em vez de descartar', () => {
    const { dir, path } = writeSnapshot(legacyRecords(), null)
    try {
      expect(() => readExisting(path)).toThrow(/seasonNum ausente/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('caminho ausente devolve lista vazia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advanced-stats-'))
    try {
      expect(readExisting(join(dir, 'nao-existe.json'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
