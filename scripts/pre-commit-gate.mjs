#!/usr/bin/env node
/**
 * Gate de pre-commit condicional por caminho.
 *
 * Lê os caminhos staged e delega a decisão a `scripts/lib/commitGate.mjs`:
 * só dados publicados → `test:data`; qualquer outro caminho → suíte completa
 * + build de Pages. A checagem de whitespace roda nos dois modos.
 *
 * Regras de segurança:
 * - nunca pula o gate: falha ao listar os caminhos staged vira `full`;
 * - nenhum caminho vindo do git ou de `--paths` é interpolado em shell: os
 *   comandos do gate são constantes do módulo puro e rodam via `sh -c` fixo;
 *   a checagem de whitespace usa array de argumentos;
 * - `PRE_COMMIT_DRY_RUN=1` imprime modo e comandos sem executar nada (prova
 *   offline, usada na documentação e nos testes);
 * - `--paths a,b,c` substitui a leitura do stage (prova offline sem `git add`).
 */

import { spawnSync } from 'node:child_process'
import { WHITESPACE_CHECK, classifyCommit, gateFor } from './lib/commitGate.mjs'

const WHITESPACE_LABEL = WHITESPACE_CHECK.join(' ')

function fail(message) {
  console.error(`pre-commit: ${message}`)
  process.exit(1)
}

function usage() {
  console.log('uso: node scripts/pre-commit-gate.mjs [--paths a,b,c]')
  console.log('  Sem --paths, lê os caminhos staged com git diff --cached.')
  console.log('  PRE_COMMIT_DRY_RUN=1 imprime o modo e os comandos sem executar.')
}

/** Argumentos aceitos: `--paths a,b`, `--paths=a,b`, `--help`. */
function parseArgs(argv) {
  const paths = []
  let pathsProvided = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--paths') {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new Error('--paths exige um valor (lista separada por vírgula; use "" para lista vazia).')
      }
      paths.push(value)
      pathsProvided = true
      index += 1
      continue
    }
    if (arg.startsWith('--paths=')) {
      paths.push(arg.slice('--paths='.length))
      pathsProvided = true
      continue
    }
    throw new Error(`argumento desconhecido: ${arg}`)
  }
  return { help: false, paths, pathsProvided }
}

/**
 * Caminhos staged, ou `null` quando o git falha (o chamador cai em `full`).
 * `-z` separa por NUL: nome com espaço/quebra de linha não vira dois caminhos.
 */
function readStagedPaths() {
  const result = spawnSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'utf8' },
  )
  if (result.error) {
    console.warn(`pre-commit: não foi possível executar git (${result.error.message}); gate completo (fail-safe).`)
    return null
  }
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim()
    console.warn(`pre-commit: não foi possível listar os caminhos staged${detail ? ` (${detail})` : ''}; gate completo (fail-safe).`)
    return null
  }
  return result.stdout.split('\0').filter((path) => path !== '')
}

function collectPaths(parsed) {
  if (!parsed.pathsProvided) return readStagedPaths()
  return parsed.paths
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

function runWhitespaceCheck() {
  const result = spawnSync(WHITESPACE_CHECK[0], WHITESPACE_CHECK.slice(1), { stdio: 'inherit' })
  if (result.error) {
    fail(`não foi possível executar '${WHITESPACE_LABEL}': ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`'${WHITESPACE_LABEL}' encontrou problemas no conteúdo staged.`)
  }
}

/** Comandos do gate são constantes: `sh -c` fixo, nunca interpolação. */
function runGateCommand(command) {
  const result = spawnSync('/bin/sh', ['-c', command], { stdio: 'inherit' })
  if (result.error) {
    fail(`não foi possível executar '${command}': ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`'${command}' falhou. Verifique as dependências locais; nenhuma instalação automática foi executada.`)
  }
}

function main() {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  if (parsed.help) {
    usage()
    return
  }

  const staged = collectPaths(parsed)
  const classification = staged === null
    ? { mode: 'full', reason: 'não foi possível listar os caminhos staged: fail-safe full', matched: [], unmatched: [] }
    : classifyCommit(staged)
  const gate = gateFor(classification.mode)

  console.log(`pre-commit: modo ${classification.mode} — ${classification.reason}`)
  if (classification.matched.length > 0) {
    console.log(`pre-commit: dados (${classification.matched.length}): ${classification.matched.join(', ')}`)
  }
  if (classification.unmatched.length > 0) {
    console.log(`pre-commit: fora da allowlist (${classification.unmatched.length}): ${classification.unmatched.join(', ')}`)
  }
  console.log(`pre-commit: gate ${gate.label}`)
  const commands = [WHITESPACE_LABEL, ...gate.commands]
  commands.forEach((command, index) => {
    console.log(`  ${index + 1}. ${command}`)
  })

  const dryRun = /^(?:1|true|yes)$/i.test(process.env.PRE_COMMIT_DRY_RUN ?? '')
  if (dryRun) {
    console.log('pre-commit: PRE_COMMIT_DRY_RUN=1 — nada foi executado.')
    return
  }

  runWhitespaceCheck()
  for (const command of gate.commands) runGateCommand(command)
}

main()
