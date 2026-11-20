/**
 * Roundtrip do snapshot de dados avançados (365scores): o snapshot legado não
 * tinha `seasonNum` por registro e o backfill o removia ao gravar, então o
 * filtro da temporada corrente descartava tudo e `validateAdvancedStats`
 * abortava por contagem. Os testes de persistência usam diretório temporário;
 * o caso `write:false` apenas LÊ `src/advancedStats2026.ts` e o snapshot real
 * para provar que os bytes não mudam.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADVANCED_STATS_SOURCE, advancedMatches } from '../src/advancedStats2026.ts'
import { collectGameDetails, publishAdvancedStats, readExisting, readPackagedPairs, renderModuleFromSnapshot } from './backfill-xg-cards.mjs'
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

describe('publishAdvancedStats', () => {
  const MODULE_PATH = 'src/advancedStats2026.ts'
  const SNAPSHOT_PATH = 'data/source-snapshots/advanced-stats-2026.json'
  const fetchedAt = '2026-11-20T00:00:00.000Z'
  const recordsWithSeason = () => legacyRecords().map((record) => ({ ...record, seasonNum: SEASON }))

  it('write:false não altera src/advancedStats2026.ts nem o snapshot (bytes iguais)', () => {
    const moduleBefore = readFileSync(MODULE_PATH)
    const snapshotBefore = readFileSync(SNAPSHOT_PATH)

    const result = publishAdvancedStats({
      records: recordsWithSeason(),
      seasonNum: SEASON,
      expectedMatches: recordsWithSeason().length,
      fetchedAt,
      write: false,
    })

    expect(result.written).toBe(false)
    expect(result.coverage).toEqual({ matches: recordsWithSeason().length, expected: recordsWithSeason().length, missing: [] })
    expect(readFileSync(MODULE_PATH)).toEqual(moduleBefore)
    expect(readFileSync(SNAPSHOT_PATH)).toEqual(snapshotBefore)
  })

  it('write:true grava snapshot autoconsistente e módulo na mesma validação', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advanced-publish-'))
    const snapshotPath = join(dir, 'advanced-stats-2026.json')
    const modulePath = join(dir, 'advancedStats2026.ts')
    try {
      const records = recordsWithSeason()
      const result = publishAdvancedStats({
        records,
        seasonNum: SEASON,
        expectedMatches: records.length,
        fetchedAt,
        write: true,
        snapshotPath,
        modulePath,
      })

      expect(result.written).toBe(true)
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
      expect(snapshot.records).toEqual(records)
      expect(snapshot.fetchedAt).toBe(fetchedAt)
      expect(snapshot.sha256).toBe(createHash('sha256').update(JSON.stringify(records), 'utf8').digest('hex'))
      const moduleText = readFileSync(modulePath, 'utf8')
      expect(moduleText).toContain(`fetchedAt: '${fetchedAt}'`)
      expect(moduleText).toContain(`matches: ${records.length},\n    expected: ${records.length},\n    missing: [],`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('regressão de cobertura não escreve e emite SECONDARY_REGRESSION', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advanced-publish-'))
    const snapshotPath = join(dir, 'advanced-stats-2026.json')
    const modulePath = join(dir, 'advancedStats2026.ts')
    const packagedModule = 'export const ADVANCED_STATS_SOURCE = {\n  coverage: {\n    matches: 5,\n    expected: 5,\n    missing: [],\n  },\n} as const\n'
    writeFileSync(modulePath, packagedModule)
    try {
      const warnings = []
      const records = recordsWithSeason()
      const result = publishAdvancedStats({
        records,
        seasonNum: SEASON,
        expectedMatches: records.length,
        fetchedAt,
        write: true,
        snapshotPath,
        modulePath,
        warn: (line) => warnings.push(line),
      })

      expect(result.written).toBe(false)
      expect(result.reason).toBe('coverage-regression')
      expect(result.coverage).toMatchObject({ matches: records.length })
      expect(warnings.join('\n')).toContain('::warning::SECONDARY_REGRESSION')
      expect(readFileSync(modulePath, 'utf8')).toBe(packagedModule)
      expect(existsSync(snapshotPath)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falha de validação não escreve nem o snapshot nem o módulo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advanced-publish-'))
    const snapshotPath = join(dir, 'advanced-stats-2026.json')
    const modulePath = join(dir, 'advancedStats2026.ts')
    try {
      const records = recordsWithSeason()
      expect(() => publishAdvancedStats({
        records: [...records, records[0]],
        seasonNum: SEASON,
        expectedMatches: records.length,
        fetchedAt,
        write: true,
        snapshotPath,
        modulePath,
      })).toThrow(/duplicado/)

      expect(existsSync(snapshotPath)).toBe(false)
      expect(existsSync(modulePath)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cobertura publicada', () => {
  it('deriva do pacote e lista em missing todo par sem registro', () => {
    const packagedPairs = readPackagedPairs()
    const recorded = new Set(advancedMatches.map((record) => `${record.home}|${record.away}`))
    const covered = packagedPairs.filter((pair) => recorded.has(pair))
    const absent = packagedPairs.filter((pair) => !recorded.has(pair))
    const { coverage } = ADVANCED_STATS_SOURCE

    expect(coverage.expected).toBe(packagedPairs.length)
    expect(coverage.matches).toBe(covered.length)
    expect(coverage.matches + coverage.missing.length).toBe(coverage.expected)
    expect([...coverage.missing].sort()).toEqual([...absent].sort())
  })
})

describe('coleta incremental', () => {
  it('merge preserva registros antigos e adiciona só os novos', () => {
    const existing = legacyRecords().map((record) => ({ ...record, seasonNum: SEASON }))
    const fresh = { ...freshRecord, home: 'bahia', away: 'santos' }
    const merged = mergeAdvancedStats(existing, [fresh])

    expect(merged).toHaveLength(existing.length + 1)
    expect(merged.find((record) => record.gameId === existing[0].gameId)).toEqual(existing[0])
    expect(merged.find((record) => record.gameId === fresh.gameId)).toEqual(fresh)
  })

  it('detalhe de um jogo que falha não aborta o lote e o par fica sem registro', async () => {
    const games = [
      { gameId: 9001, home: 'flamengo', away: 'palmeiras' },
      { gameId: 9002, home: 'corinthians', away: 'santos' },
      { gameId: 9003, home: 'gremio', away: 'vasco' },
    ]
    const details = {
      9001: { home: 'Flamengo', away: 'Palmeiras' },
      9003: { home: 'Gremio', away: 'Vasco da Gama' },
    }
    const warnings = []
    const { records, failures } = await collectGameDetails({
      games,
      fetchDetail: async (game) => {
        const names = details[game.gameId]
        if (!names) throw new Error('Resposta 365scores sem objeto game.')
        return {
          game: {
            id: game.gameId,
            roundNum: 1,
            homeCompetitor: { id: 1, name: names.home, score: '1.0' },
            awayCompetitor: { id: 2, name: names.away, score: '1.0' },
            chartEvents: { events: [{ xg: '1.00', competitorNum: 1 }, { xg: '1.00', competitorNum: 2 }] },
            events: [{ eventType: { name: 'Yellow Card' }, competitorId: 1 }],
          },
        }
      },
      warn: (line) => warnings.push(line),
    })

    expect(records.map((record) => record.gameId)).toEqual([9001, 9003])
    expect(failures).toEqual([{ gameId: 9002, message: 'Resposta 365scores sem objeto game.' }])
    expect(warnings.join('\n')).toContain('::warning::SECONDARY_DETAIL_FAILED source=advanced game=9002')

    // O par sem registro aparece na cobertura quando o pacote é conhecido.
    const summary = validateAdvancedStats(records, {
      expectedMatches: games.length,
      packagedPairs: ['flamengo|palmeiras', 'corinthians|santos', 'gremio|vasco'],
    })
    expect(summary.coverage.missing).toEqual(['corinthians|santos'])
  })

  it('render-only não regride cobertura: módulo vigente maior que o snapshot não é reescrito', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advanced-render-'))
    const snapshotPath = join(dir, 'advanced-stats-2026.json')
    const modulePath = join(dir, 'advancedStats2026.ts')
    const packagedModule = 'export const ADVANCED_STATS_SOURCE = {\n  coverage: {\n    matches: 5,\n    expected: 5,\n    missing: [],\n  },\n} as const\n'
    writeFileSync(modulePath, packagedModule)
    try {
      const snapshot = { source: '365scores', seasonNum: SEASON, fetchedAt: '2026-11-07T12:00:00Z', sha256: 'legado', records: legacyRecords() }
      writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 1) + '\n')

      const warnings = []
      const result = renderModuleFromSnapshot({
        snapshotPath,
        modulePath,
        packagedPairs: ['flamengo|palmeiras', 'corinthians|santos'],
        warn: (line) => warnings.push(line),
      })

      expect(result.written).toBe(false)
      expect(result.reason).toBe('coverage-regression')
      expect(result.coverage).toMatchObject({ matches: legacyRecords().length })
      expect(warnings.join('\n')).toContain('::warning::SECONDARY_REGRESSION source=advanced')
      expect(readFileSync(modulePath, 'utf8')).toBe(packagedModule)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('render-only regenera o módulo a partir do snapshot sem tocar no snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advanced-render-'))
    const snapshotPath = join(dir, 'advanced-stats-2026.json')
    const modulePath = join(dir, 'advancedStats2026.ts')
    const records = legacyRecords()
    const fixtureFetchedAt = '2026-11-07T12:00:00Z'
    try {
      const snapshot = { source: '365scores', seasonNum: SEASON, fetchedAt: fixtureFetchedAt, sha256: 'legado', records }
      writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 1) + '\n')
      const before = readFileSync(snapshotPath)

      const result = renderModuleFromSnapshot({
        snapshotPath,
        modulePath,
        packagedPairs: ['flamengo|palmeiras', 'corinthians|santos', 'bahia|santos'],
      })

      expect(result.written).toBe(true)
      expect(result.coverage).toEqual({ matches: records.length, expected: 3, missing: ['bahia|santos'] })
      const moduleText = readFileSync(modulePath, 'utf8')
      expect(moduleText).toContain(`fetchedAt: '${fixtureFetchedAt}'`)
      expect(moduleText).toContain("sha256: 'legado'")
      expect(moduleText).toContain("missing: ['bahia|santos'],")
      expect(readFileSync(snapshotPath)).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
