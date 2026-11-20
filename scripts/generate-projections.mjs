#!/usr/bin/env node
/**
 * Gera `public/projecoes.json` a partir da **mesma** `runProjectionRaw()` que o
 * Web Worker usa, com as constantes de produção (`SIMULATION_COUNT`,
 * `SIMULATION_SEED`, `BACKTEST_SIMULATIONS`).
 *
 * Por que existe: consumidores externos (agentes, outros projetos, o próprio
 * app no caminho rápido de carregamento) precisam dos percentuais exatos sem
 * re-simular 500 mil temporadas. O arquivo publica contagens inteiras e o
 * `inputHash` do pacote que as produziu.
 *
 * Uso:
 *   node scripts/generate-projections.mjs            # escreve public/projecoes.json
 *   node scripts/generate-projections.mjs --dry-run  # simula e não escreve
 *   node scripts/generate-projections.mjs --out=/tmp/p.json
 *
 * Runner: não há `tsx`/`vite-node` na árvore de dependências. `src/` é
 * TypeScript com imports sem extensão, então o Node não carrega esses módulos
 * direto; o `vite` (dependência de produção, versão exata) já resolve isso via
 * `createServer().ssrLoadModule()` — nenhuma dependência nova entra por causa
 * deste script.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DEFAULT_OUTPUT,
  buildProjectionsDocument,
  serializeProjectionsDocument,
  validateProjectionsDocument,
} from './lib/projectionsJson.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Módulos de `src/` que o gerador precisa. `projectionDerived` é carregado
 * direto porque `projection.ts` só reexporta `deriveProjectionResult` — as
 * contagens por cenário vivem no módulo leve.
 */
const SOURCE_MODULES = {
  projection: '/src/projection.ts',
  projectionDerived: '/src/projectionDerived.ts',
  config: '/src/projectionConfig.ts',
  inputHash: '/src/projectionInputHash.ts',
  metadata: '/src/sourceMetadata.ts',
  currentSeason: '/src/currentSeasonResults.ts',
}

/**
 * Carrega os módulos TS por Vite SSR. Devolve `close()` — o servidor de
 * transformação precisa ser fechado explicitamente ou o processo não termina.
 */
export async function loadProjectionModules() {
  const { createServer } = await import('vite')
  // `configFile: false` de propósito: o gerador só precisa do transform de TS,
  // não do plugin React nem de `define` de build (`__BUILD_SHA__`). Se algum
  // módulo do grafo passar a depender de um define do `vite.config.ts`, o
  // `ssrLoadModule` lança `ReferenceError` e o gerador falha alto — melhor do
  // que injetar valores de build falsos no arquivo publicado.
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const [projection, projectionDerived, config, inputHash, metadata, currentSeason] = await Promise.all(
      Object.values(SOURCE_MODULES).map((path) => server.ssrLoadModule(path)),
    )
    return { projection, projectionDerived, config, inputHash, metadata, currentSeason, close: () => server.close() }
  } catch (error) {
    await server.close()
    throw error
  }
}

/**
 * Parser puro dos argumentos. `--out` aceita `<caminho>` e `=<caminho>`.
 *
 * @param {string[]} argv argumentos após o nome do script
 * @returns {{dryRun: boolean, outPath: string, help: boolean}}
 */
export function parseGenerateArgs(argv = []) {
  const options = { dryRun: false, outPath: DEFAULT_OUTPUT, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (typeof arg !== 'string' || arg === '') throw new Error(`Argumento inválido: ${JSON.stringify(arg)}`)
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--out') {
      const value = argv[index + 1]
      if (typeof value !== 'string' || value === '') throw new Error('--out exige um caminho: --out <caminho>')
      options.outPath = value
      index += 1
      continue
    }
    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length)
      if (value === '') throw new Error('--out exige um caminho: --out=<caminho>')
      options.outPath = value
      continue
    }
    throw new Error(`Argumento desconhecido: ${arg}`)
  }
  return options
}

/**
 * Roda a simulação de produção e monta (opcionalmente grava) o documento.
 *
 * `loadModules` é injetável para o teste exercitar o caminho real com poucas
 * simulações sem subir Vite. `generatedAt` default é o carimbo do pacote de
 * dados: duas execuções sobre o mesmo pacote geram bytes idênticos, então o
 * gate `changed` do updater não vê diferença quando não houve resultado novo.
 *
 * @param {{
 *   loadModules?: () => Promise<Record<string, any>>,
 *   simulations?: number, seed?: number, backtestSimulations?: number,
 *   outPath?: string, dryRun?: boolean, generatedAt?: string,
 * }} options
 */
export async function generateProjections(options = {}) {
  const {
    loadModules = loadProjectionModules,
    simulations,
    seed,
    backtestSimulations,
    outPath = DEFAULT_OUTPUT,
    dryRun = false,
    generatedAt,
  } = options
  const startedAt = Date.now()
  const modules = await loadModules()
  try {
    const effectiveSimulations = simulations ?? modules.config.SIMULATION_COUNT
    const effectiveSeed = seed ?? modules.config.SIMULATION_SEED
    const effectiveBacktest = backtestSimulations ?? modules.config.BACKTEST_SIMULATIONS

    const raw = modules.projection.runProjectionRaw({
      simulations: effectiveSimulations,
      seed: effectiveSeed,
      backtestSimulations: effectiveBacktest,
    })
    // A semente efetiva vem do resultado: `runProjectionRaw` devolve o default
    // que aplicou, e o documento não pode declarar um valor diferente do usado.
    const document = buildProjectionsDocument({
      raw,
      scenarioCounts: modules.projectionDerived.scenarioCountsFrom,
      cutoffUtc: modules.metadata.ANALYTICAL_CUTOFF_UTC,
      generatedAt: generatedAt ?? modules.currentSeason.CURRENT_SEASON_PACK_GENERATED_AT,
      inputHash: modules.inputHash.computeProjectionInputHash(),
      backtestSimulations: effectiveBacktest,
    })
    const problems = validateProjectionsDocument(document)
    if (problems.length > 0) {
      throw new Error(`Documento de projeções inválido:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    }
    const json = serializeProjectionsDocument(document)
    const absoluteOutPath = resolve(root, outPath)
    if (!dryRun) {
      mkdirSync(dirname(absoluteOutPath), { recursive: true })
      writeFileSync(absoluteOutPath, json)
    }
    return {
      document,
      json,
      bytes: Buffer.byteLength(json, 'utf8'),
      outPath: absoluteOutPath,
      wrote: !dryRun,
      durationMs: Date.now() - startedAt,
    }
  } finally {
    await modules.close?.()
  }
}

const HELP = `Gera public/projecoes.json (projeção Monte Carlo de produção).

  node scripts/generate-projections.mjs [--dry-run] [--out <caminho>]

  --dry-run        simula e valida sem escrever arquivo
  --out <caminho>  destino (default: ${DEFAULT_OUTPUT}), relativo à raiz do repo
  --help, -h       esta mensagem

As constantes (simulações, semente, backtest) vêm de src/projectionConfig.ts:
não há flag para alterá-las, para que o artefato publicado seja sempre o do app.`

async function main() {
  const options = parseGenerateArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }
  const result = await generateProjections({ outPath: options.outPath, dryRun: options.dryRun })
  const document = result.document
  const kilobytes = (result.bytes / 1024).toFixed(1)
  console.log(
    `projeções: ${document.simulations} simulações · semente ${document.seed} · backtest ${document.backtestSimulations}/temporada`,
  )
  console.log(`hash de entrada: ${document.inputHash} · corte ${document.analyticalCutoffUtc}`)
  console.log(`clubes: ${document.clubs.length} · pontos distintos: ${document.pointsByPosition.length}`)
  if (result.wrote) {
    console.log(`escrito: ${result.outPath.replace(`${root}/`, '')} (${kilobytes} KB) em ${result.durationMs} ms`)
  } else {
    console.log(`DRY RUN: nada escrito (${kilobytes} KB) em ${result.durationMs} ms`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Falha ao gerar projeções: ${error.message}`)
    process.exit(1)
  })
}
