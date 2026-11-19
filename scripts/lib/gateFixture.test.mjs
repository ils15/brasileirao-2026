import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEspnScoreboard } from './dataPipeline.mjs'
import {
  addUtcDays,
  buildFixtureBundle,
  buildScoreboardPayload,
  kickoffFor,
  parsePackedResults,
  pickSyntheticPairs,
  readFixtureBundle,
  serializeJson,
  sha256,
  syntheticScoreFor,
} from './gateFixture.mjs'

const schedule = [
  { ref: '003', round: 2, home: 'santos', away: 'gremio' },
  { ref: '001', round: 1, home: 'flamengo', away: 'palmeiras' },
  { ref: '002', round: 1, home: 'santos', away: 'flamengo' },
  { ref: '004', round: 2, home: 'palmeiras', away: 'santos' },
  { ref: '005', round: 3, home: 'gremio', away: 'palmeiras' },
  { ref: '006', round: 3, home: 'flamengo', away: 'gremio' },
  { ref: '007', round: 4, home: 'palmeiras', away: 'gremio' },
]

const existing = [{ home: 'flamengo', away: 'palmeiras' }]
const targetDate = '2026-11-16'

describe('pickSyntheticPairs', () => {
  it('percorre o calendário em ordem de ref e descarta pares já disputados', () => {
    const pairs = pickSyntheticPairs({ schedule, existing, count: 3 })
    expect(pairs.map((pair) => pair.ref)).toEqual(['002', '003', '004'])
  })

  it('aplica o placar sintético fixo por índice da seleção', () => {
    const pairs = pickSyntheticPairs({ schedule, existing, count: 3 })
    expect(pairs.map(({ homeGoals, awayGoals }) => [homeGoals, awayGoals])).toEqual([
      [0, 1],
      [1, 0],
      [2, 1],
    ])
  })

  it('preserva o par ordenado (casa, fora) do calendário', () => {
    const pairs = pickSyntheticPairs({ schedule, existing, count: 3 })
    for (const pair of pairs) {
      const fixture = schedule.find((entry) => entry.ref === pair.ref)
      expect(fixture).toMatchObject({ home: pair.home, away: pair.away, round: pair.round })
    }
  })

  it('falha alto quando o calendário não tem pendentes suficientes', () => {
    expect(() => pickSyntheticPairs({ schedule, existing, count: 99 })).toThrow(/pendentes/)
    expect(() => pickSyntheticPairs({ schedule, existing, count: 0 })).toThrow(/Contagem inválida/)
  })

  it('syntheticScoreFor é determinístico e cobre casa, empate e visitante', () => {
    const outcomes = [0, 1, 2, 3, 4, 5].map((index) => syntheticScoreFor(index))
    expect(outcomes).toEqual([
      { homeGoals: 0, awayGoals: 1 },
      { homeGoals: 1, awayGoals: 0 },
      { homeGoals: 2, awayGoals: 1 },
      { homeGoals: 0, awayGoals: 0 },
      { homeGoals: 1, awayGoals: 1 },
      { homeGoals: 2, awayGoals: 0 },
    ])
  })
})

describe('payload ESPN sintético', () => {
  const pairs = pickSyntheticPairs({ schedule, existing, count: 3 })
  const payload = buildScoreboardPayload({ targetDate, pairs })
  const parsed = parseEspnScoreboard(serializeJson(payload), { cutoffUtc: `${targetDate}T23:59:59Z` })

  it('round-trip pelo parser real da ESPN devolve exatamente os pares sintéticos', () => {
    expect(parsed.map(({ home, away, homeGoals, awayGoals }) => ({ home, away, homeGoals, awayGoals })))
      .toEqual(pairs.map(({ home, away, homeGoals, awayGoals }) => ({ home, away, homeGoals, awayGoals })))
    expect(parsed.every((match) => match.source === 'espn')).toBe(true)
    expect(parsed.map((match) => match.sourceRef)).toEqual(pairs.map((pair) => `gate-${pair.ref}`))
  })

  it('kickoff sintético fica dentro do dia da coleta (≤ 23:59:59Z)', () => {
    const dayEnd = `${targetDate}T23:59:59Z`
    for (const event of payload.events) {
      expect(event.date.startsWith(targetDate)).toBe(true)
      expect(Date.parse(event.date)).toBeLessThanOrEqual(Date.parse(dayEnd))
    }
    expect(payload.events.map((event) => event.date)).toEqual(pairs.map((_, index) => kickoffFor(targetDate, index)))
  })

  it('rejeita kickoff que passaria da meia-noite', () => {
    expect(() => kickoffFor(targetDate, 6)).toThrow(/meia-noite/)
  })

  it('marca o payload como dado sintético para quem abrir o arquivo', () => {
    expect(payload._fixture.kind).toBe('synthetic')
    expect(payload._fixture.warning).toMatch(/SINTÉTICOS/)
  })
})

describe('buildFixtureBundle', () => {
  const bundle = buildFixtureBundle({ schedule, existing, count: 3, targetDate })
  const manifest = JSON.parse(bundle.files.find((file) => file.path === 'manifest.json').content)
  const payloadFile = bundle.files.find((file) => file.path.startsWith('espn-scoreboard-'))
  const expected = JSON.parse(bundle.files.find((file) => file.path === 'expected.json').content)

  it('produz payload, expected e manifest determinísticos', () => {
    const again = buildFixtureBundle({ schedule, existing, count: 3, targetDate })
    expect(again.files).toEqual(bundle.files)
    expect(serializeJson(payloadFile.content)).toBe(serializeJson(bundle.files[0].content))
  })

  it('manifest carrega sha256 de cada payload e do expected', () => {
    expect(manifest.added).toBe(3)
    expect(manifest.payloads).toEqual([{ path: payloadFile.path, sha256: sha256(payloadFile.content) }])
    expect(manifest.expected.sha256).toBe(sha256(bundle.files.find((file) => file.path === 'expected.json').content))
    expect(manifest.targetDate).toBe(targetDate)
  })

  it('expected lista os resultados novos com ref e placar', () => {
    expect(expected.added).toBe(manifest.added)
    expect(expected.newResults.map((entry) => entry.ref)).toEqual(bundle.pairs.map((pair) => pair.ref))
    expect(expected.newResults.every((entry) => Number.isInteger(entry.homeGoals) && Number.isInteger(entry.awayGoals))).toBe(true)
  })
})

describe('readFixtureBundle', () => {
  function writeBundle(directory) {
    const bundle = buildFixtureBundle({ schedule, existing, count: 3, targetDate })
    for (const file of bundle.files) writeFileSync(join(directory, file.path), file.content)
    return bundle
  }

  it('lê de volta a fixture gravada e confere os hashes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gate-fixture-'))
    try {
      const bundle = writeBundle(directory)
      const read = readFixtureBundle(directory)
      expect(read.targetDate).toBe(targetDate)
      expect(read.added).toBe(3)
      expect(read.payloads).toEqual([{ path: bundle.files[0].path, content: bundle.files[0].content }])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('aborta quando o payload no disco divergiu do manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gate-fixture-'))
    try {
      writeBundle(directory)
      writeFileSync(join(directory, 'espn-scoreboard-2026-11-16.json'), '{"events":[]}\n')
      expect(() => readFixtureBundle(directory)).toThrow(/sha256 divergente/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('addUtcDays', () => {
  it('avança um dia de calendário cruzando fim de mês', () => {
    expect(addUtcDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addUtcDays('2026-11-15', 1)).toBe('2026-11-16')
    expect(() => addUtcDays('15/11/2026', 1)).toThrow(/Data inválida/)
  })
})

describe('parsePackedResults', () => {
  it('lê o pacote atual e falha alto em linha não parseável', () => {
    const results = parsePackedResults(readFileSync('src/currentSeasonResults.ts', 'utf8'))
    expect(results.length).toBeGreaterThan(0)
    for (const match of results) {
      expect(typeof match.home).toBe('string')
      expect(Number.isInteger(match.homeGoals)).toBe(true)
      expect(match.source === 'espn' || match.source === 'football-data').toBe(true)
    }
    expect(() => parsePackedResults('  { home: "a", away: "b" }')).toThrow(/não parseável/)
  })
})

describe('isolamento da fixture', () => {
  function sourceFiles(directory) {
    const found = []
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        found.push(...sourceFiles(path))
      } else if (/\.[jt]sx?$/.test(entry.name)) {
        found.push(path)
      }
    }
    return found
  }

  it('nenhum arquivo de src/** importa de data/fixtures/**', () => {
    const offenders = sourceFiles('src').filter((file) => readFileSync(file, 'utf8').includes('data/fixtures'))
    expect(offenders).toEqual([])
  })

  it('a pasta de fixture não é ignorada nem contém arquivos gigantes', () => {
    const directory = 'data/fixtures/gate-repro'
    const files = readdirSync(directory)
    expect(files).toContain('manifest.json')
    expect(files).toContain('expected.json')
    for (const file of files) {
      expect(statSync(join(directory, file)).size).toBeLessThan(200_000)
    }
  })
})
