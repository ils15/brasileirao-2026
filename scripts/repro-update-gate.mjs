/**
 * Harness `npm run repro:gate`: prova os dois lados do updater, offline e
 * determinístico, sem depender de testes de UI acoplados ao pacote.
 *
 * Cenários injetados pelo manifest da fixture (`scenarios`):
 * - `fail`: o gate sai 1 → o updater escreve, aborta, deixa recibo em
 *   `.pantheon/logs/` nomeando o comando, não commita e mantém a sujeira nos
 *   caminhos de dados;
 * - `pass`: o gate sai 0 → o updater escreve, conclui sem recibo.
 *
 * Cada cenário copia os payloads, roda o updater e restaura os caminhos de
 * dados no `finally`. A restauração é **byte-a-byte a partir de um baseline**
 * capturado antes de qualquer cópia — nunca `git checkout`: a árvore de
 * trabalho pode conter alterações legítimas de outra sessão, e o harness não
 * tem autoridade sobre elas.
 *
 * Prova final: `git status --porcelain -- <DATA_PATHS>` antes e depois precisa
 * ser idêntico (mesma lista, mesmo conteúdo), inclusive quando havia sujeira
 * legítima. Nenhum arquivo fora de `DATA_PATHS` é removido ou sobrescrito.
 *
 * Códigos: 0 os dois cenários bateram e a árvore voltou ao baseline · 2 a
 * restauração divergiu do baseline (bytes ou `git status`) · 3 fixture inválida
 * ou não moveu o pacote · 4 restauração falhou de forma inesperada · 5 cenário
 * não reproduz o contrato.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  captureBaseline,
  changedDataPaths,
  disposeBaseline,
  restoreBaseline,
  snapshotDataPaths,
  verifyBaseline,
} from './lib/dataBaseline.mjs'
import { listScoreboardPayloads, readFixtureBundle } from './lib/gateFixture.mjs'
import { parsePorcelainPath } from './lib/updateFailure.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = join(root, 'data/fixtures/gate-repro')
const snapshotsDir = join(root, 'data/source-snapshots')
const logsDir = join(root, '.pantheon', 'logs')

/** Caminhos que o updater publica — o único escopo que o harness suja e restaura. */
const DATA_PATHS = [
  'src/currentSeasonResults.ts',
  'src/projectionData.ts',
  'src/sourceMetadata.ts',
  'src/advancedStats2026.ts',
  'src/scorers2026.ts',
  'data/source-snapshots',
  'docs/atualizacoes.md',
]

/** Escrita do updater no modo offline (sem fontes secundárias). */
const WRITTEN_PATHS = [
  'src/currentSeasonResults.ts',
  'src/projectionData.ts',
  'src/sourceMetadata.ts',
  'docs/atualizacoes.md',
]

const RECEIPT_FILE = /^update-data-failure-.+\.json$/

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw new Error(`git ${args.join(' ')} falhou: ${result.error.message}`)
  return result
}

function dataTreeStatus() {
  return git(['status', '--porcelain', '--', ...DATA_PATHS]).stdout.trim()
}

function headSha() {
  return git(['rev-parse', 'HEAD']).stdout.trim()
}

function listReceipts() {
  if (!existsSync(logsDir)) return []
  return readdirSync(logsDir).filter((file) => RECEIPT_FILE.test(file)).sort()
}

function readReceipt(file) {
  return JSON.parse(readFileSync(join(logsDir, file), 'utf8'))
}

function isWrittenPath(path) {
  return WRITTEN_PATHS.some((base) => path === base || path.startsWith(`${base}/`))
}

function formatDivergences(divergences) {
  return divergences.map(({ path, expected, actual }) => `  - ${path}: esperado ${expected}, obtido ${actual}`).join('\n')
}

/**
 * Restaura o baseline e prova os bytes. Divergência é `abortCode` 2: continuar
 * depois disso arriscaria apagar trabalho alheio na próxima execução.
 */
function restoreAndVerify(baseline) {
  restoreBaseline(baseline)
  const divergences = verifyBaseline(baseline)
  if (divergences.length > 0) {
    const error = new Error(`restauração divergiu do baseline:\n${formatDivergences(divergences)}`)
    error.abortCode = 2
    throw error
  }
}

/**
 * Copia a fixture, roda o updater com o gate do cenário e restaura sempre.
 * Devolve o que o cenário precisa provar — nada é assumido.
 */
function runScenario(scenario, fixture, baseline) {
  const receiptsBefore = new Set(listReceipts())
  const headBefore = headSha()
  let result

  try {
    for (const payload of fixture.payloads) {
      const destination = join(snapshotsDir, payload.path)
      if (existsSync(destination)) {
        // Caminho legítimo de outra sessão: o baseline devolve os bytes originais.
        console.log(`Caminho já existia (será restaurado do baseline): ${payload.path}`)
      }
      copyFileSync(join(fixtureDir, payload.path), destination)
      console.log(`Copiado: ${payload.path} → data/source-snapshots/`)
    }

    console.log(
      `Rodando updater offline: --cutoff=${fixture.baseCutoffUtc} --today=${fixture.targetDate} · cenário "${scenario.id}" (expect ${scenario.expect}) · gate "${scenario.test}"`,
    )
    const run = spawnSync(
      process.execPath,
      [
        join(root, 'scripts/update-data.mjs'),
        '--offline',
        '--no-commit',
        `--cutoff=${fixture.baseCutoffUtc}`,
        `--today=${fixture.targetDate}`,
        `--test=${scenario.test}`,
      ],
      { cwd: root, encoding: 'utf8' },
    )

    if (run.error) throw new Error(`updater não executou: ${run.error.message}`)
    if (run.stdout) process.stdout.write(run.stdout)
    if (run.stderr) process.stderr.write(run.stderr)

    const stdout = run.stdout ?? ''
    const changed = changedDataPaths(baseline.files, snapshotDataPaths(root, DATA_PATHS))
    result = {
      exitCode: run.status ?? 1,
      signal: run.signal ?? null,
      moved: stdout.split('\n').some((line) => line.startsWith(`Novos efetivos: ${fixture.added}`)),
      changed,
      written: changed.some(isWrittenPath),
      head: headSha(),
      headBefore,
      newReceipts: listReceipts().filter((file) => !receiptsBefore.has(file)),
    }
  } finally {
    restoreAndVerify(baseline)
  }

  return result
}

/** Lista do que não bateu no cenário; vazio = contrato cumprido. */
function evaluateScenario(scenario, fixture, result) {
  const problems = []
  const expectedExit = scenario.expect === 'fail' ? 1 : 0

  if (!result.moved) problems.push(`fixture não moveu o pacote — esperava "Novos efetivos: ${fixture.added}"`)
  if (result.exitCode !== expectedExit) problems.push(`exit ${result.exitCode}, esperado ${expectedExit}`)
  if (result.signal != null) problems.push(`updater encerrado por sinal ${result.signal}`)
  if (!result.written) problems.push('nenhum módulo/log de dados foi escrito antes do gate')
  if (result.changed.length === 0) problems.push('nenhum caminho de dados mudou durante a execução')
  if (result.head !== result.headBefore) problems.push('o updater criou commit (HEAD mudou)')

  if (scenario.expect === 'fail') {
    if (result.newReceipts.length === 0) {
      problems.push('nenhum recibo de falha em .pantheon/logs')
    } else {
      try {
        const receipt = readReceipt(result.newReceipts.at(-1))
        if (receipt.command !== scenario.test) {
          problems.push(`recibo nomeia "${receipt.command}", esperado "${scenario.test}"`)
        }
        if (receipt.exitCode !== 1) problems.push(`recibo com exitCode ${receipt.exitCode}, esperado 1`)
        if (!Array.isArray(receipt.dirtyPaths) || receipt.dirtyPaths.length === 0) {
          problems.push('recibo sem caminhos escritos nesta execução')
        } else {
          // Sujeira pré-existente tem que ficar de fora: o recibo só atribui ao
          // updater o caminho cujo conteúdo mudou desde o baseline dele.
          const changedSet = new Set(result.changed)
          for (const line of receipt.dirtyPaths) {
            const path = parsePorcelainPath(line)
            if (path == null) problems.push(`recibo com linha ilegível: ${line}`)
            else if (!changedSet.has(path)) problems.push(`recibo lista "${path}", que não foi escrito nesta execução`)
          }
        }
      } catch (error) {
        problems.push(`recibo ilegível em .pantheon/logs: ${error.message}`)
      }
    }
  } else if (result.newReceipts.length > 0) {
    problems.push(`cenário verde deixou recibo: ${result.newReceipts.join(', ')}`)
  }

  return problems
}

function runAll(baseline) {
  const statusBefore = dataTreeStatus()
  if (statusBefore !== '') {
    console.log(`Baseline capturado com sujeira legítima preservada:\n${statusBefore}`)
  }

  const fixture = readFixtureBundle(fixtureDir)

  const payloadNames = listScoreboardPayloads(fixtureDir)
  if (payloadNames.length !== fixture.payloads.length) {
    console.error(`repro:gate abortado: fixture tem ${payloadNames.length} payloads de scoreboard, manifest declara ${fixture.payloads.length}.`)
    return 3
  }

  const failures = []
  let fixtureMoved = true

  for (const scenario of fixture.scenarios) {
    console.log(`\n=== Cenário "${scenario.id}" (expect ${scenario.expect}) ===`)
    const result = runScenario(scenario, fixture, baseline)
    const problems = evaluateScenario(scenario, fixture, result)
    if (!result.moved) fixtureMoved = false

    if (problems.length === 0) {
      console.log(`repro:gate: cenário "${scenario.id}" ok — exit ${result.exitCode}, escrita presente, sem commit${scenario.expect === 'fail' ? ', recibo nomeando o comando' : ', sem recibo'}.`)
    } else {
      failures.push({ scenario, problems })
      console.error(`repro:gate: cenário "${scenario.id}" NÃO reproduziu o contrato.`)
      for (const problem of problems) console.error(`  - ${problem}`)
    }
  }

  const divergences = verifyBaseline(baseline)
  if (divergences.length > 0) {
    console.error('repro:gate: restauração divergiu do baseline.')
    console.error(formatDivergences(divergences))
    return 2
  }

  const statusAfter = dataTreeStatus()
  if (statusAfter !== statusBefore) {
    console.error('repro:gate: restauração divergiu do baseline (git status mudou).')
    console.error(`antes:\n${statusBefore || '(limpo)'}`)
    console.error(`depois:\n${statusAfter || '(limpo)'}`)
    return 2
  }

  if (failures.length > 0) {
    return fixtureMoved ? 5 : 3
  }

  const dirtyLines = statusBefore === '' ? 0 : statusBefore.split('\n').length
  console.log(`\nrepro:gate: os dois cenários passaram (vermelho com recibo, verde sem recibo); git status dos caminhos de dados idêntico antes/depois (${dirtyLines} linha(s) de sujeira preservada).`)
  return 0
}

function main() {
  const baseline = captureBaseline(root, DATA_PATHS)
  try {
    return runAll(baseline)
  } finally {
    disposeBaseline(baseline)
  }
}

let code
try {
  code = main()
} catch (error) {
  console.error(`repro:gate abortado: ${error.message}`)
  code = error.abortCode ?? 4
}
process.exit(code)
