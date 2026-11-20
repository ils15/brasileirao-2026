/**
 * Contrato do baseline byte-a-byte usado pelo harness do gate.
 *
 * Tudo acontece em `tmpdir`: nenhum teste toca a árvore real. O ponto é que a
 * restauração devolve exatamente os bytes capturados — inclusive sujeira
 * pré-existente — e remove o caminho que não existia antes.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  captureBaseline,
  changedDataPaths,
  disposeBaseline,
  hashDirectory,
  restoreBaseline,
  snapshotDataPaths,
  verifyBaseline,
} from './dataBaseline.mjs'

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'data-baseline-test-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'snapshots', 'nested'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), 'conteúdo pré-existente, não commitado\n')
  writeFileSync(join(root, 'snapshots/velho.json'), '{"velho":true}\n')
  writeFileSync(join(root, 'snapshots/nested/x.json'), 'x')
  return root
}

const PATHS = ['src/a.ts', 'src/novo.ts', 'snapshots']

describe('snapshotDataPaths/changedDataPaths', () => {
  it('expande diretório por arquivo e detecta alta, mudança e remoção', () => {
    const root = workspace()
    try {
      const before = snapshotDataPaths(root, PATHS)
      expect(before['src/a.ts']).toBeTypeOf('string')
      expect(before['snapshots/velho.json']).toBeTypeOf('string')
      expect(before['snapshots/nested/x.json']).toBeTypeOf('string')
      expect(before['src/novo.ts']).toBeUndefined()

      writeFileSync(join(root, 'src/a.ts'), 'reescrito\n')
      writeFileSync(join(root, 'src/novo.ts'), 'novo\n')
      rmSync(join(root, 'snapshots/velho.json'))
      const after = snapshotDataPaths(root, PATHS)

      expect(changedDataPaths(before, after)).toEqual([
        'snapshots/velho.json',
        'src/a.ts',
        'src/novo.ts',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('hashDirectory muda quando qualquer byte sob o diretório muda', () => {
    const root = workspace()
    try {
      const before = hashDirectory(join(root, 'snapshots'))
      writeFileSync(join(root, 'snapshots/nested/x.json'), 'y')
      expect(hashDirectory(join(root, 'snapshots'))).not.toBe(before)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('captureBaseline/restoreBaseline/verifyBaseline', () => {
  it('restaura sujeira pré-existente byte a byte e remove caminho criado', () => {
    const root = workspace()
    const originalA = readFileSync(join(root, 'src/a.ts'))
    const baseline = captureBaseline(root, PATHS)
    try {
      writeFileSync(join(root, 'src/a.ts'), 'sobrescrito pelo harness\n')
      writeFileSync(join(root, 'src/novo.ts'), 'criado pelo harness\n')
      writeFileSync(join(root, 'snapshots/novo.json'), 'snapshot criado\n')
      rmSync(join(root, 'snapshots/velho.json'))

      restoreBaseline(baseline)

      expect(readFileSync(join(root, 'src/a.ts'))).toEqual(originalA)
      expect(existsSync(join(root, 'src/novo.ts'))).toBe(false)
      expect(existsSync(join(root, 'snapshots/novo.json'))).toBe(false)
      expect(readFileSync(join(root, 'snapshots/velho.json'), 'utf8')).toBe('{"velho":true}\n')
      expect(verifyBaseline(baseline)).toEqual([])
    } finally {
      disposeBaseline(baseline)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('verifyBaseline nomeia a divergência em vez de silenciar', () => {
    const root = workspace()
    const baseline = captureBaseline(root, PATHS)
    try {
      writeFileSync(join(root, 'src/a.ts'), 'divergiu\n')
      const divergences = verifyBaseline(baseline)
      expect(divergences.map((entry) => entry.path)).toContain('src/a.ts')
    } finally {
      disposeBaseline(baseline)
      rmSync(root, { recursive: true, force: true })
    }
  })
})
