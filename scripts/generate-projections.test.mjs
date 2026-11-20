/**
 * Contrato de `public/projecoes.json`.
 *
 * O gerador roda `runProjectionRaw` de verdade, com 200 simulações injetadas —
 * 500 mil não pertencem à suíte. Os módulos de `src/` são carregados nativamente
 * (o Vite do Vitest já resolve TS), então o teste exercita o mesmo caminho do
 * script sem subir um servidor SSR.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { generateProjections, parseGenerateArgs } from './generate-projections.mjs'
import {
  DEFAULT_OUTPUT,
  POSITION_SLOTS,
  PROJECTIONS_SCHEMA_VERSION,
  SCENARIO_COUNT,
  validateProjectionsDocument,
} from './lib/projectionsJson.mjs'
import { buildPointOutcomeCurveFromSnapshot } from '../src/pointCurve.ts'
import * as currentSeason from '../src/currentSeasonResults.ts'
import * as config from '../src/projectionConfig.ts'
import * as projection from '../src/projection.ts'
import * as projectionDerived from '../src/projectionDerived.ts'
import * as inputHash from '../src/projectionInputHash.ts'
import { currentClubs, remainingFixtures } from '../src/projectionData.ts'
import * as metadata from '../src/sourceMetadata.ts'

const SIMULATIONS = 200
const BACKTEST_SIMULATIONS = 40

const sourceModules = {
  projection,
  projectionDerived,
  config,
  inputHash,
  metadata,
  currentSeason,
}
const loadModules = async () => sourceModules

const workDir = mkdtempSync(join(tmpdir(), 'projecoes-json-'))
afterAll(() => rmSync(workDir, { recursive: true, force: true }))

const outputPath = join(workDir, 'projecoes.json')
const result = await generateProjections({
  loadModules,
  simulations: SIMULATIONS,
  backtestSimulations: BACKTEST_SIMULATIONS,
  outPath: outputPath,
})
const document = result.document

describe('documento gerado', () => {
  it('passa na validação de schema do próprio gerador', () => {
    expect(validateProjectionsDocument(document)).toEqual([])
  })

  it('é gravado no destino e relido como JSON equivalente', () => {
    expect(result.wrote).toBe(true)
    expect(existsSync(outputPath)).toBe(true)
    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(document)
  })

  it('declara as constantes efetivas da execução', () => {
    expect(document.simulations).toBe(SIMULATIONS)
    expect(document.backtestSimulations).toBe(BACKTEST_SIMULATIONS)
    expect(document.seed).toBe(config.SIMULATION_SEED)
    expect(document.analyticalCutoffUtc).toBe(metadata.ANALYTICAL_CUTOFF_UTC)
    expect(document.inputHash).toBe(inputHash.computeProjectionInputHash())
  })

  it('publica um clube por clube do pacote, na ordem da tabela', () => {
    expect(document.clubs.map((club) => club.id)).toEqual(currentClubs.map((club) => club.id))
    expect(document.clubs.map((club) => club.currentPoints)).toEqual(currentClubs.map((club) => club.points))
  })

  it('mantém contagens inteiras que somam exatamente as simulações', () => {
    for (const club of document.clubs) {
      expect(club.positionCounts).toHaveLength(POSITION_SLOTS)
      const total = club.positionCounts.reduce((sum, count) => sum + count, 0)
      expect(total).toBe(document.simulations)
      for (const count of club.positionCounts) expect(Number.isInteger(count)).toBe(true)
      expect(club.positionCounts[0]).toBe(0)
    }
  })

  it('traz as 16 combinações de devolução com chave 0..15', () => {
    for (const club of document.clubs) {
      expect(club.scenarioCounts).toHaveLength(SCENARIO_COUNT)
      expect(club.scenarioCounts.map((scenario) => scenario.scenarioKey)).toEqual(
        Array.from({ length: SCENARIO_COUNT }, (_, key) => key),
      )
      // Cada cenário conta posições de um histograma de 20 clubes: o total
      // nunca pode passar das simulações do clube.
      for (const scenario of club.scenarioCounts) {
        expect(scenario.libertadores).toBeLessThanOrEqual(document.simulations)
        expect(scenario.direct).toBeLessThanOrEqual(scenario.libertadores)
      }
    }
  })

  it('a tabela global pontos × posição fecha com simulações × clubes', () => {
    const rowsTotal = document.pointsByPosition.reduce(
      (sum, row) => sum + row.positionCounts.reduce((total, count) => total + count, 0),
      0,
    )
    expect(rowsTotal).toBe(document.simulations * document.clubs.length)
    const points = document.pointsByPosition.map((row) => row.points)
    expect(points).toEqual([...points].sort((left, right) => left - right))
  })

  it('publica o agregado de máscaras da curva de pontos (schema v2)', () => {
    expect(document.schemaVersion).toBe(PROJECTIONS_SCHEMA_VERSION)
    expect(PROJECTIONS_SCHEMA_VERSION).toBe(2)
    const snapshot = document.pointCurve
    expect(snapshot).toBeTypeOf('object')
    expect(snapshot.simulationCount).toBe(SIMULATIONS)
    expect(snapshot.points.length).toBeGreaterThan(0)
    expect(snapshot.masks).toHaveLength(snapshot.points.length)
    expect(snapshot.counts).toHaveLength(snapshot.points.length)
    expect(snapshot.points).toEqual([...snapshot.points].sort((left, right) => left - right))
    expect(new Set(snapshot.points).size).toBe(snapshot.points.length)
    snapshot.masks.forEach((masks, index) => {
      expect(masks.length).toBeGreaterThan(0)
      expect(masks).toHaveLength(snapshot.counts[index].length)
      for (const mask of masks) {
        expect(Number.isInteger(mask)).toBe(true)
        // Máscara de 20 posições, bit 0 = 1º: nunca zero, nunca acima de 2^20.
        expect(mask).toBeGreaterThan(0)
        expect(mask).toBeLessThan(2 ** 20)
      }
      for (const count of snapshot.counts[index]) {
        expect(Number.isInteger(count)).toBe(true)
        expect(count).toBeGreaterThan(0)
      }
    })
  })

  it('reconstrói os ICs cluster-robustos exatos a partir do snapshot publicado', () => {
    // Snapshot em memória da mesma execução: é a referência contra a qual o
    // arquivo publicado tem de ser numericamente idêntico.
    const raw = projection.runProjectionRaw({
      simulations: SIMULATIONS,
      seed: config.SIMULATION_SEED,
      backtestSimulations: BACKTEST_SIMULATIONS,
    })
    const inMemory = buildPointOutcomeCurveFromSnapshot(raw.pointCurve)
    const fromPublished = buildPointOutcomeCurveFromSnapshot(document.pointCurve)

    expect(inMemory.rows.length).toBeGreaterThan(0)
    expect(fromPublished).toEqual(inMemory)
    // O caminho de produção (worker e derivação) usa o mesmo agregado.
    expect(projectionDerived.deriveProjectionResult(raw).pointCurve).toEqual(inMemory)
    // Prova de que a igualdade não é trivial: há ICs não degenerados.
    expect(inMemory.rows.some((row) => row.upper95 > row.lower95)).toBe(true)
  })

  it('rejeita documento v2 sem pointCurve ou com máscara que não reproduz pointsByPosition', () => {
    const { pointCurve, ...withoutCurve } = document
    expect(pointCurve).toBeTypeOf('object')
    expect(validateProjectionsDocument(withoutCurve).some((problem) => problem.includes('pointCurve'))).toBe(true)

    const tampered = {
      ...document,
      pointCurve: {
        ...pointCurve,
        counts: pointCurve.counts.map((counts, index) => (index === 0 ? counts.map((count) => count + 1) : counts)),
      },
    }
    expect(validateProjectionsDocument(tampered).some((problem) => problem.includes('pointCurve'))).toBe(true)
  })

  it('é determinístico: mesma entrada, mesmos bytes', async () => {
    const again = await generateProjections({
      loadModules,
      simulations: SIMULATIONS,
      backtestSimulations: BACKTEST_SIMULATIONS,
      outPath: join(workDir, 'copia.json'),
    })
    expect(again.json).toBe(result.json)
    expect(again.document).toEqual(result.document)
  })
})

describe('--dry-run', () => {
  it('simula e valida sem escrever o destino', async () => {
    const dryPath = join(workDir, 'nao-deve-existir.json')
    const dry = await generateProjections({
      loadModules,
      simulations: SIMULATIONS,
      backtestSimulations: BACKTEST_SIMULATIONS,
      outPath: dryPath,
      dryRun: true,
    })
    expect(dry.wrote).toBe(false)
    expect(existsSync(dryPath)).toBe(false)
    // O conteúdo do dry-run é o mesmo que seria gravado.
    expect(dry.json).toBe(result.json)
  })
})

describe('parseGenerateArgs', () => {
  it('defaults: escreve public/projecoes.json', () => {
    expect(parseGenerateArgs([])).toEqual({ dryRun: false, outPath: DEFAULT_OUTPUT, help: false })
  })

  it('aceita --dry-run, --out=<path> e --out <path>', () => {
    expect(parseGenerateArgs(['--dry-run', '--out=/tmp/a.json'])).toEqual({
      dryRun: true,
      outPath: '/tmp/a.json',
      help: false,
    })
    expect(parseGenerateArgs(['--out', '/tmp/b.json']).outPath).toBe('/tmp/b.json')
  })

  it('recusa --out sem valor e argumento desconhecido', () => {
    expect(() => parseGenerateArgs(['--out'])).toThrow(/--out exige/)
    expect(() => parseGenerateArgs(['--simulations=10'])).toThrow(/desconhecido/)
  })
})

describe('computeProjectionInputHash', () => {
  const base = () => ({
    cutoffUtc: metadata.ANALYTICAL_CUTOFF_UTC,
    playedMatches: 7,
    clubs: currentClubs,
    fixtures: remainingFixtures,
  })

  it('é estável entre chamadas e não depende da ordem dos insumos', () => {
    expect(inputHash.computeProjectionInputHash()).toBe(inputHash.computeProjectionInputHash())
    expect(inputHash.hashProjectionInputs(base())).toBe(inputHash.hashProjectionInputs(base()))
    const reordered = { ...base(), clubs: [...currentClubs].reverse(), fixtures: [...remainingFixtures].reverse() }
    expect(inputHash.hashProjectionInputs(reordered)).toBe(inputHash.hashProjectionInputs(base()))
  })

  it('muda quando o corte muda', () => {
    const shifted = { ...base(), cutoffUtc: 'corte-sintetico-deslocado' }
    expect(inputHash.hashProjectionInputs(shifted)).not.toBe(inputHash.hashProjectionInputs(base()))
  })

  it('muda quando uma partida pendente entra ou sai da lista', () => {
    const fewer = { ...base(), fixtures: remainingFixtures.slice(0, -1) }
    expect(inputHash.hashProjectionInputs(fewer)).not.toBe(inputHash.hashProjectionInputs(base()))
    const extra = {
      ...base(),
      fixtures: [...remainingFixtures, { round: '99', home: 'flamengo', away: 'palmeiras' }],
    }
    expect(inputHash.hashProjectionInputs(extra)).not.toBe(inputHash.hashProjectionInputs(base()))
  })

  it('muda quando os pontos de um clube ou as partidas disputadas mudam', () => {
    const first = currentClubs[0]
    const bumped = {
      ...base(),
      clubs: [{ ...first, points: first.points + 1 }, ...currentClubs.slice(1)],
    }
    expect(inputHash.hashProjectionInputs(bumped)).not.toBe(inputHash.hashProjectionInputs(base()))
    expect(inputHash.hashProjectionInputs({ ...base(), playedMatches: 8 })).not.toBe(
      inputHash.hashProjectionInputs(base()),
    )
  })

  it('produz hex de 16 dígitos', () => {
    expect(inputHash.computeProjectionInputHash()).toMatch(/^[0-9a-f]{16}$/)
  })
})
