/**
 * Harness `npm run repro:gate`: reproduz o deadlock do updater de forma offline.
 *
 * 1. Guarda de árvore: aborta se algum **caminho de dados** que o updater escreve
 *    já estiver sujo (alterações não relacionadas no repo — AGENTS.md, .gitignore —
 *    são ignoradas de propósito).
 * 2. Copia os payloads da fixture para `data/source-snapshots/`.
 * 3. Roda o updater com `--offline --no-commit --cutoff=<manifest> --today=<manifest>`
 *    e o gate estreito. O corte e o alvo vêm do manifest da fixture, nunca do
 *    pacote vivo: o harness não quebra quando o corte avança.
 * 4. Exige que o pacote tenha se movido (`Novos efetivos: <added>`), senão sai 3.
 * 5. Com o gate vermelho, exige que **todos** os `expectedFailures` do manifest
 *    apareçam na saída — uma fixture que só quebra um dos testes não protege a
 *    correção, e o harness sai 5 mandando regenerar.
 * 6. Restaura os caminhos de dados no `finally` e confere que ficaram limpos, senão sai 4.
 * 7. Propaga o código do updater: 1 = deadlock reproduzido, 0 = destravado.
 *
 * Códigos: 0 ok · 1 gate vermelho (esperado antes de T03/T04) · 2 árvore suja ·
 * 3 fixture não moveu o pacote · 4 restauração falhou · 5 fixture não reproduz
 * as duas falhas declaradas.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { failedGateTests, listScoreboardPayloads, readFixtureBundle } from './lib/gateFixture.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = join(root, 'data/fixtures/gate-repro')
const snapshotsDir = join(root, 'data/source-snapshots')

/** Caminhos que o updater escreve — o único escopo que o harness suja e restaura. */
const DATA_PATHS = [
  'src/currentSeasonResults.ts',
  'src/projectionData.ts',
  'src/sourceMetadata.ts',
  'data/source-snapshots',
  'docs/atualizacoes.md',
]

const GATE_TESTS = 'npx vitest run src/ProjectionSection.test.tsx src/MatchSimulator.test.tsx'

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw new Error(`git ${args.join(' ')} falhou: ${result.error.message}`)
  return result
}

function dataTreeStatus() {
  return git(['status', '--porcelain', '--', ...DATA_PATHS]).stdout.trim()
}

function restoreDataPaths(createdSnapshots) {
  for (const file of createdSnapshots) {
    const path = join(snapshotsDir, file)
    if (existsSync(path)) rmSync(path)
  }
  const checkout = git(['checkout', '--', ...DATA_PATHS])
  if (checkout.status !== 0) {
    throw new Error(`git checkout dos caminhos de dados falhou:\n${checkout.stderr}`)
  }
}

function main() {
  const dirty = dataTreeStatus()
  if (dirty !== '') {
    console.error('repro:gate abortado: caminhos de dados já estão sujos antes da reprodução.')
    console.error(dirty)
    console.error('Restaure-os (git checkout -- <caminho>) e rode de novo.')
    return 2
  }

  const fixture = readFixtureBundle(fixtureDir)

  const payloadNames = listScoreboardPayloads(fixtureDir)
  if (payloadNames.length !== fixture.payloads.length) {
    console.error(`repro:gate abortado: fixture tem ${payloadNames.length} payloads de scoreboard, manifest declara ${fixture.payloads.length}.`)
    return 2
  }

  let exitCode = 0
  let restoreFailure = null
  const createdSnapshots = []

  try {
    for (const payload of fixture.payloads) {
      const destination = join(snapshotsDir, payload.path)
      if (existsSync(destination)) {
        console.error(`repro:gate abortado: ${payload.path} já existe em data/source-snapshots/ (caminho sujo).`)
        return 2
      }
      copyFileSync(join(fixtureDir, payload.path), destination)
      createdSnapshots.push(payload.path)
      console.log(`Copiado: ${payload.path} → data/source-snapshots/`)
    }

    console.log(`Rodando updater offline: --cutoff=${fixture.baseCutoffUtc} --today=${fixture.targetDate} · gate "${GATE_TESTS}"`)
    const run = spawnSync(
      process.execPath,
      [
        join(root, 'scripts/update-data.mjs'),
        '--offline',
        '--no-commit',
        `--cutoff=${fixture.baseCutoffUtc}`,
        `--today=${fixture.targetDate}`,
        `--test=${GATE_TESTS}`,
      ],
      { cwd: root, encoding: 'utf8' },
    )

    if (run.error) throw new Error(`updater não executou: ${run.error.message}`)
    if (run.stdout) process.stdout.write(run.stdout)
    if (run.stderr) process.stderr.write(run.stderr)

    const expectedLine = `Novos efetivos: ${fixture.added}`
    const moved = run.stdout.split('\n').some((line) => line.startsWith(expectedLine))
    const failures = failedGateTests(`${run.stdout}\n${run.stderr}`, fixture.expectedFailures)
    const gateStatus = run.status ?? 1

    if (!moved) {
      console.error(`repro:gate: fixture não moveu o pacote — esperava "${expectedLine}".`)
      const seen = run.stdout.split('\n').find((line) => line.startsWith('Novos efetivos:')) ?? '(sem linha "Novos efetivos")'
      console.error(`  observado: ${seen}`)
      console.error('  Rode `npm run fixture:gate` para regenerar a fixture.')
      exitCode = 3
    } else if (gateStatus === 0) {
      // Gate verde: deadlock destravado (estado pós-correção).
      exitCode = 0
    } else {
      const missing = fixture.expectedFailures.filter((file) => !failures.has(file))
      if (missing.length > 0) {
        console.error('repro:gate: fixture não reproduz o deadlock; rode npm run fixture:gate')
        console.error(`  esperava vermelhos: ${fixture.expectedFailures.join(', ')}`)
        console.error(`  vermelhos observados: ${[...failures].join(', ') || 'nenhum'}`)
        exitCode = 5
      } else {
        exitCode = gateStatus
      }
    }
  } finally {
    try {
      restoreDataPaths(createdSnapshots)
    } catch (error) {
      restoreFailure = error.message
    }
  }

  const stillDirty = dataTreeStatus()
  if (restoreFailure || stillDirty !== '') {
    console.error('repro:gate: restauração dos caminhos de dados falhou.')
    if (restoreFailure) console.error(restoreFailure)
    if (stillDirty !== '') console.error(stillDirty)
    return 4
  }

  if (exitCode === 0) {
    console.log('repro:gate: gate verde com a fixture — o deadlock está destravado.')
  } else if (exitCode === 5) {
    console.log('repro:gate: fixture não reproduz o deadlock; árvore restaurada.')
  } else {
    console.log(`repro:gate: gate vermelho com a fixture (exit ${exitCode}) — deadlock reproduzido; árvore restaurada.`)
  }
  return exitCode
}

let code
try {
  code = main()
} catch (error) {
  console.error(`repro:gate abortado: ${error.message}`)
  code = 4
}
process.exit(code)
