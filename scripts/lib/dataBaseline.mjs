/**
 * Baseline byte-a-byte dos caminhos de dados.
 *
 * O updater escreve módulos, snapshots e o log **antes** do gate. Qualquer
 * harness que roda o updater em cima de uma árvore de trabalho legítima precisa
 * devolver exatamente os bytes que encontrou — `git checkout` não serve: ele
 * descarta trabalho não commitado de outra sessão. Este módulo captura o
 * conteúdo em um diretório temporário e restaura/verifica por sha256.
 *
 * - `snapshotDataPaths` expande diretórios em um mapa `{ caminho: sha256 }`
 *   (ausente = sem chave), usado para saber o que a execução escreveu.
 * - `captureBaseline` guarda uma cópia de cada caminho; `restoreBaseline`
 *   remove caminho que não existia e reescreve o que existia; `verifyBaseline`
 *   prova a restauração comparando sha256 (árvore inteira para diretório).
 * - Nada fora dos caminhos informados é lido, copiado ou apagado.
 */

import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function hashFile(path) {
  return sha256Bytes(readFileSync(path))
}

/** Arquivos sob `directory` em ordem estável, com caminho relativo POSIX. */
function listFiles(directory, prefix = '') {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative))
    else if (entry.isFile()) files.push(relative)
  }
  return files.sort()
}

/** sha256 da árvore: caminho relativo + sha256 de cada arquivo, em ordem. */
export function hashDirectory(directory) {
  const hash = createHash('sha256')
  for (const relative of listFiles(directory)) {
    hash.update(relative)
    hash.update('\0')
    hash.update(hashFile(join(directory, relative)))
    hash.update('\n')
  }
  return hash.digest('hex')
}

const EMPTY_DIRECTORY = sha256Bytes('')

/**
 * Mapa `{ caminho: sha256 }` do conteúdo atual; diretório é expandido por
 * arquivo (diretório vazio vira a chave `caminho/`). Caminho ausente não entra
 * no mapa — a diferença entre os dois mapas é o que a execução escreveu.
 */
export function snapshotDataPaths(root, paths) {
  const snapshot = {}
  for (const path of paths) {
    const absolute = join(root, path)
    if (!existsSync(absolute)) continue
    if (statSync(absolute).isDirectory()) {
      const files = listFiles(absolute)
      if (files.length === 0) snapshot[`${path}/`] = EMPTY_DIRECTORY
      for (const file of files) snapshot[`${path}/${file}`] = hashFile(join(absolute, file))
    } else {
      snapshot[path] = hashFile(absolute)
    }
  }
  return snapshot
}

/** Caminhos cujo conteúdo difere entre dois snapshots (alta, mudança ou remoção). */
export function changedDataPaths(before = {}, after = {}) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed = []
  for (const path of paths) {
    if ((before[path] ?? null) !== (after[path] ?? null)) changed.push(path)
  }
  return changed.sort()
}

/**
 * Copia cada caminho existente para um diretório temporário e registra o
 * sha256 (arquivo ou árvore). Caminho ausente fica com `existed: false`.
 */
export function captureBaseline(root, paths) {
  const workDir = mkdtempSync(join(tmpdir(), 'data-baseline-'))
  const entries = paths.map((path, index) => {
    const absolute = join(root, path)
    if (!existsSync(absolute)) {
      return { path, existed: false, kind: null, sha256: null, backup: null }
    }
    const directory = statSync(absolute).isDirectory()
    const backup = join(workDir, `${String(index).padStart(2, '0')}-${path.replace(/\//g, '_')}`)
    cpSync(absolute, backup, { recursive: directory })
    return {
      path,
      existed: true,
      kind: directory ? 'directory' : 'file',
      sha256: directory ? hashDirectory(absolute) : hashFile(absolute),
      backup,
    }
  })
  return { root, workDir, entries, files: snapshotDataPaths(root, paths) }
}

/** Restaura os bytes capturados; caminho que não existia antes é removido. */
export function restoreBaseline(baseline) {
  for (const entry of baseline.entries) {
    const absolute = join(baseline.root, entry.path)
    if (!entry.existed) {
      rmSync(absolute, { recursive: true, force: true })
      continue
    }
    if (entry.kind === 'directory') {
      rmSync(absolute, { recursive: true, force: true })
      mkdirSync(dirname(absolute), { recursive: true })
      cpSync(entry.backup, absolute, { recursive: true })
    } else {
      if (existsSync(absolute) && statSync(absolute).isDirectory()) rmSync(absolute, { recursive: true, force: true })
      mkdirSync(dirname(absolute), { recursive: true })
      cpSync(entry.backup, absolute)
    }
  }
}

/** Lista de divergências (`{ path, expected, actual }`); vazio = bytes idênticos. */
export function verifyBaseline(baseline) {
  const divergences = []
  for (const entry of baseline.entries) {
    const absolute = join(baseline.root, entry.path)
    if (!entry.existed) {
      if (existsSync(absolute)) divergences.push({ path: entry.path, expected: 'ausente', actual: 'presente' })
      continue
    }
    if (!existsSync(absolute)) {
      divergences.push({ path: entry.path, expected: entry.sha256, actual: 'ausente' })
      continue
    }
    const stats = statSync(absolute)
    const actual = entry.kind === 'directory'
      ? (stats.isDirectory() ? hashDirectory(absolute) : 'não é diretório')
      : (stats.isFile() ? hashFile(absolute) : 'não é arquivo')
    if (actual !== entry.sha256) divergences.push({ path: entry.path, expected: entry.sha256, actual })
  }
  return divergences
}

/** Remove o diretório temporário da captura (nunca toca na árvore de trabalho). */
export function disposeBaseline(baseline) {
  rmSync(baseline.workDir, { recursive: true, force: true })
}
