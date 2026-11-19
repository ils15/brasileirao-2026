/**
 * Contrato de robustez do workflow de atualização pós-rodada.
 *
 * O YAML é lido como texto: o teste não depende de parser YAML nem de ação do
 * GitHub, e afirma invariantes que, se quebradas, publicariam dado não validado
 * ou sobrescreveriam `main` à força.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const workflowPath = join(root, '.github/workflows/update-data.yml')
const packagePath = join(root, 'package.json')

const workflow = readFileSync(workflowPath, 'utf8')
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))

describe('update-data.yml — gate e push', () => {
  it('não tem ramo de árvore suja (o updater commita internamente; fallback publicaria dado não validado)', () => {
    expect(workflow).not.toMatch(/elif\s+\[\s+-n\s+"\$\(git status --porcelain/)
    expect(workflow).not.toContain('árvore não commitada pelo updater')
  })

  it('falha alto: `set -euo pipefail` no script de coleta', () => {
    expect(workflow).toContain('set -euo pipefail')
  })

  it('push tenta rebase sobre origin/main em vez de forçar', () => {
    expect(workflow).toContain('git rebase origin/main')
    expect(workflow).toContain('git rebase --abort')
    expect(workflow).not.toContain('--force')
    expect(workflow).not.toContain('--force-with-lease')
  })

  it('roda a suíte completa antes do push do commit de dados', () => {
    const gate = workflow.indexOf('Full test suite gate')
    const push = workflow.indexOf('Push data commit')
    expect(gate).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(push)
    expect(workflow).toMatch(/Full test suite gate[\s\S]*run: npm test/)
  })
})

describe('slice `test:data` — contrato de dados, sem UI', () => {
  const slice = pkg.scripts?.['test:data']

  it('existe em package.json', () => {
    expect(typeof slice).toBe('string')
    expect(slice).toContain('scripts/data-assertions.test.mjs')
  })

  it('não contém nenhum arquivo .tsx', () => {
    expect(slice).not.toMatch(/\.tsx\b/)
  })

  it('todo caminho do slice existe (sem teste fantasma)', () => {
    const files = slice.split(/\s+/).filter((token) => /\.(mjs|ts)$/.test(token))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(existsSync(join(root, file)), `ausente: ${file}`).toBe(true)
    }
  })
})
