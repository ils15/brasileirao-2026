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
const updateDataPath = join(root, '.github/workflows/update-data.yml')
const pagesPath = join(root, '.github/workflows/pages.yml')
const reusablePath = join(root, '.github/workflows/_pages-build-deploy.yml')
const packagePath = join(root, 'package.json')

const updateData = readFileSync(updateDataPath, 'utf8')
const pages = readFileSync(pagesPath, 'utf8')
const reusable = readFileSync(reusablePath, 'utf8')
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))

/** Bloco do job a partir da chave de topo, sem parser YAML. */
function jobBlock(source, id) {
  const match = new RegExp(`\\n {2}${id}:\\s*$`, 'm').exec(source)
  expect(match, `job ausente: ${id}`).not.toBeNull()
  const rest = source.slice(match.index + 1)
  const next = rest.search(/\n {2}[a-zA-Z0-9_-]+:\s*$/m)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('update-data.yml — gate e push', () => {
  it('não tem ramo de árvore suja (o updater commita internamente; fallback publicaria dado não validado)', () => {
    expect(updateData).not.toMatch(/elif\s+\[\s+-n\s+"\$\(git status --porcelain/)
    expect(updateData).not.toContain('árvore não commitada pelo updater')
  })

  it('falha alto: `set -euo pipefail` no script de coleta', () => {
    expect(updateData).toContain('set -euo pipefail')
  })

  it('push tenta rebase sobre origin/main em vez de forçar', () => {
    expect(updateData).toContain('git rebase origin/main')
    expect(updateData).toContain('git rebase --abort')
    expect(updateData).not.toContain('--force')
    expect(updateData).not.toContain('--force-with-lease')
  })

  it('roda a suíte completa antes do push do commit de dados', () => {
    const gate = updateData.indexOf('Full test suite gate')
    const push = updateData.indexOf('Push data commit')
    expect(gate).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(push)
    expect(updateData).toMatch(/Full test suite gate[\s\S]*run: npm test/)
  })
})

describe('publicação do Pages — um reutilizável, dois callers', () => {
  const reusableRef = /uses:\s*\.\/\.github\/workflows\/_pages-build-deploy\.yml/

  it('update-data.yml não builda, sobe artefato nem faz deploy por conta própria', () => {
    expect(updateData).not.toContain('upload-pages-artifact')
    expect(updateData).not.toContain('deploy-pages')
    expect(updateData).not.toContain('configure-pages')
    expect(updateData).not.toMatch(/GITHUB_PAGES/)
  })

  it('pages.yml também não duplica build/upload/deploy', () => {
    expect(pages).not.toContain('upload-pages-artifact')
    expect(pages).not.toContain('deploy-pages')
    expect(pages).not.toContain('configure-pages')
    expect(pages).not.toMatch(/GITHUB_PAGES/)
  })

  it('os dois workflows chamam o mesmo reutilizável', () => {
    expect(updateData).toMatch(reusableRef)
    expect(pages).toMatch(reusableRef)
  })

  it('reutilizável é chamável, publica e serializa no grupo `pages`', () => {
    expect(reusable).toMatch(/^ {2}workflow_call:$/m)
    expect(reusable).toContain('upload-pages-artifact')
    expect(reusable).toContain('deploy-pages')
    expect(reusable).toMatch(/^concurrency:$/m)
    expect(reusable).toMatch(/group:\s*pages\b/)
    expect(reusable).toMatch(/cancel-in-progress:\s*false/)
    expect(reusable).toContain('name: github-pages')
  })

  it('mantém os pins das actions de Pages no reutilizável', () => {
    const pins = [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
      'actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d',
      'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346',
    ]
    for (const pin of pins) expect(reusable, `pin ausente: ${pin}`).toContain(pin)
  })

  it('pages.yml publica só em push para main, depois dos testes e com as permissões de Pages', () => {
    const job = jobBlock(pages, 'pages')
    expect(job).toContain('needs: test')
    expect(job).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'")
    expect(job).toContain('pages: write')
    expect(job).toContain('id-token: write')
    expect(job).toMatch(reusableRef)
    expect(job).toContain('sha: ${{ github.sha }}')
  })

  it('update-data.yml publica só quando houve commit de dados, depois do push', () => {
    const job = jobBlock(updateData, 'pages')
    expect(job).toContain('needs: update')
    expect(job).toContain("if: needs.update.outputs.changed == 'true'")
    expect(job).toContain('pages: write')
    expect(job).toContain('id-token: write')
    expect(job).toMatch(reusableRef)
    expect(job).toContain('sha: ${{ needs.update.outputs.sha }}')
    expect(updateData.indexOf('Push data commit')).toBeLessThan(
      updateData.search(/\n {2}pages:\s*$/m),
    )
  })

  it('publica o HEAD empurrado, não o SHA do evento do cron', () => {
    const push = updateData.indexOf('Push data commit')
    const pagesJob = updateData.search(/\n {2}pages:\s*$/m)
    const pushBlock = updateData.slice(push, pagesJob)
    expect(pushBlock).toContain('id: push')
    expect(pushBlock).toContain('echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"')
    expect(updateData).toContain('sha: ${{ steps.push.outputs.sha }}')
    // O checkout do workflow chamado usa o SHA do evento do caller por padrão;
    // sem o input, o build do cron leria o commit anterior ao do bot.
    expect(reusable).toContain('ref: ${{ inputs.sha || github.sha }}')
    expect(reusable).toMatch(/workflow_call:[\s\S]*?^ {6}sha:$/m)
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
