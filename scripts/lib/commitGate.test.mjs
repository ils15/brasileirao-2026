/**
 * Contrato do seletor de gate do pre-commit.
 *
 * O classificador é puro e é a única coisa que decide entre `test:data` e a
 * suíte completa. Ele falha fechado: qualquer dúvida vira `full`, então um
 * bug aqui bloqueia commit (chato), nunca publica dado sem o gate completo
 * (caro).
 *
 * A allowlist é comparada com a lista literal de `.github/workflows/update-data.yml`
 * (`data_paths=`), lida como texto — sem parser YAML. Se as duas listas
 * divergirem, o teste falha antes de o hook tratar como dado algo que o
 * workflow não trata.
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DATA_PATHS, WHITESPACE_CHECK, classifyCommit, gateFor } from './commitGate.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const workflowPath = join(root, '.github/workflows/update-data.yml')
const runnerPath = join(root, 'scripts/pre-commit-gate.mjs')

/** Tokens do `data_paths=` do workflow, sem parser YAML. */
function workflowDataPaths() {
  const source = readFileSync(workflowPath, 'utf8')
  const match = /^\s*data_paths='([^']+)'\s*$/m.exec(source)
  expect(match, 'linha `data_paths=` ausente no workflow').not.toBeNull()
  return match[1].trim().split(/\s+/)
}

function withoutTrailingSlash(path) {
  return path.endsWith('/') ? path.slice(0, -1) : path
}

function runDryRun(paths) {
  return spawnSync(
    process.execPath,
    [runnerPath, '--paths', paths],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PRE_COMMIT_DRY_RUN: '1' },
    },
  )
}

describe('DATA_PATHS — allowlist de dados publicados', () => {
  it('casa com a lista literal de data_paths do workflow', () => {
    const fromWorkflow = workflowDataPaths().map(withoutTrailingSlash).sort()
    const fromModule = DATA_PATHS.map(withoutTrailingSlash).sort()
    expect(fromModule).toEqual(fromWorkflow)
  })

  it('marca o diretório de snapshots como prefixo', () => {
    expect(DATA_PATHS).toContain('data/source-snapshots/')
  })
})

describe('classifyCommit', () => {
  it('só dados → data-only', () => {
    const result = classifyCommit([
      'src/currentSeasonResults.ts',
      'src/sourceMetadata.ts',
      'docs/atualizacoes.md',
    ])
    expect(result.mode).toBe('data-only')
    expect(result.unmatched).toEqual([])
    expect(result.matched).toEqual([
      'src/currentSeasonResults.ts',
      'src/sourceMetadata.ts',
      'docs/atualizacoes.md',
    ])
  })

  it('snapshot bruto sob data/source-snapshots/ → data-only', () => {
    const result = classifyCommit([
      'data/source-snapshots/espn-scoreboard-2026-11-20.json',
      './src/scorers2026.ts',
    ])
    expect(result.mode).toBe('data-only')
    expect(result.matched).toEqual([
      'data/source-snapshots/espn-scoreboard-2026-11-20.json',
      'src/scorers2026.ts',
    ])
  })

  it('só código → full', () => {
    const result = classifyCommit(['src/App.tsx'])
    expect(result.mode).toBe('full')
    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['src/App.tsx'])
  })

  it('misto (dado + código) → full', () => {
    const result = classifyCommit(['src/currentSeasonResults.ts', 'src/App.tsx'])
    expect(result.mode).toBe('full')
    expect(result.matched).toEqual(['src/currentSeasonResults.ts'])
    expect(result.unmatched).toEqual(['src/App.tsx'])
  })

  it('caminho fora da allowlist entre dados → full', () => {
    const result = classifyCommit([
      'src/currentSeasonResults.ts',
      'src/FixtureCalendar.tsx',
      'data/source-snapshots/espn-scoreboard-2026-11-20.json',
    ])
    expect(result.mode).toBe('full')
    expect(result.unmatched).toEqual(['src/FixtureCalendar.tsx'])
  })

  it('lista vazia → full (fail-safe)', () => {
    const result = classifyCommit([])
    expect(result.mode).toBe('full')
    expect(result.reason).toMatch(/fail-safe/)
  })

  it('entrada que não é lista → full (fail-safe)', () => {
    for (const value of [undefined, null, 'src/currentSeasonResults.ts', {}]) {
      const result = classifyCommit(value)
      expect(result.mode).toBe('full')
    }
  })

  it('entrada inválida na lista → full (fail-safe)', () => {
    for (const value of [[''], ['   '], [42], ['src/currentSeasonResults.ts', null]]) {
      const result = classifyCommit(value)
      expect(result.mode).toBe('full')
    }
  })

  it('não classifica o diretório sem barra final como dado', () => {
    expect(classifyCommit(['data/source-snapshots']).mode).toBe('full')
  })
})

describe('gateFor', () => {
  it('data-only roda só o contrato de dados', () => {
    const gate = gateFor('data-only')
    expect(gate.commands).toEqual(['npm run test:data'])
    expect(gate.commands).not.toContain('npm test')
  })

  it('full roda suíte completa e build de Pages', () => {
    const gate = gateFor('full')
    expect(gate.commands).toEqual(['npm test', 'GITHUB_PAGES=true npm run build'])
    expect(gate.commands.some((command) => command.includes('GITHUB_PAGES=true'))).toBe(true)
    expect(gate.label).toMatch(/Pages/)
  })

  it('modo desconhecido → full (fail-safe)', () => {
    expect(gateFor('data').commands).toEqual(['npm test', 'GITHUB_PAGES=true npm run build'])
  })

  it('whitespace é sempre checado pelo runner, em array de argumentos', () => {
    expect(WHITESPACE_CHECK).toEqual(['git', 'diff', '--cached', '--check'])
  })
})

describe('scripts/pre-commit-gate.mjs — prova offline', () => {
  it('dado → imprime data-only e test:data, sem executar', () => {
    const result = runDryRun('src/currentSeasonResults.ts')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('data-only')
    expect(result.stdout).toContain('npm run test:data')
    expect(result.stdout).not.toContain('GITHUB_PAGES=true npm run build')
  })

  it('código → imprime full, npm test e build de Pages', () => {
    const result = runDryRun('src/App.tsx')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('full')
    expect(result.stdout).toContain('npm test')
    expect(result.stdout).toContain('GITHUB_PAGES=true npm run build')
  })

  it('lista vazia → imprime full (fail-safe)', () => {
    const result = runDryRun('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('full')
    expect(result.stdout).not.toContain('npm run test:data')
  })
})
