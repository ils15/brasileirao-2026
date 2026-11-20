/**
 * Recibo durável de falha do updater.
 *
 * O updater escreve módulos e o log **antes** do gate e do commit (ver
 * `.pantheon/deepwork/incident-stats-refresh/DISCOVERY.md`, D1). Quando algo
 * falha depois da escrita, a árvore fica suja e o único rastro é uma linha no
 * console. Este módulo transforma a falha em um artefato auditável:
 *
 * - cauda limitada de stdout/stderr (200 linhas / 64 KB);
 * - redaction obrigatória de `*_KEY=`, `*_TOKEN=`, `*_SECRET=`, `PASSWORD=` e
 *   `Authorization:` — o recibo nunca serializa `process.env`;
 * - mensagem única de `::error::` com comando, exit, teste que falhou e a
 *   instrução de restauração.
 *
 * Funções sem I/O, exceto `writeFailureReceipt` (única que toca o disco).
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { changedDataPaths } from './dataBaseline.mjs'

export const FAILURE_RECEIPT_SCHEMA = 1

/** Retenção do diretório de recibos: o mais novo nunca compete com histórico infinito. */
export const MAX_FAILURE_RECEIPTS = 20

const FAILURE_RECEIPT_FILE = /^update-data-failure-.+\.json$/

/** Cauda máxima guardada de cada fluxo. */
export const TAIL_MAX_LINES = 200
export const TAIL_MAX_BYTES = 64 * 1024

const SECRET_ASSIGNMENT = /\b([A-Za-z][A-Za-z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD)|KEY|TOKEN|SECRET|PASSWORD|PASSWD)=("[^"]*"|'[^']*'|[^\s'"]+)/gi
const SECRET_AUTHORIZATION = /(\bAuthorization\s*:\s*)([^\r\n]*)/gi

const FAILED_TEST_PATTERNS = [
  // Vitest detalhado: `FAIL  src/arquivo.test.ts > suíte > caso`
  /FAIL\s+\S+\s+>\s+([^\n]+)/,
  // Vitest resumido: `× suíte > caso` (com tempo opcional no fim)
  /[×✕]\s+([^\n]+)/,
  // Jest: `● suíte › caso`
  /(?:^|\n)\s*●\s+([^\n]+)/,
]

/** Remove valores sensíveis preservando a chave, para leitura humana. */
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
    .replace(SECRET_AUTHORIZATION, '$1[REDACTED]')
}

/** Últimas `maxLines` linhas e, depois, um teto em bytes (nunca corta no meio de um caractere). */
export function truncateTail(text, { maxLines = TAIL_MAX_LINES, maxBytes = TAIL_MAX_BYTES } = {}) {
  const value = String(text ?? '')
  if (value === '') return ''

  let lines = value.split('\n')
  if (lines.length > maxLines) lines = lines.slice(lines.length - maxLines)
  const joined = lines.join('\n')
  if (Buffer.byteLength(joined, 'utf8') <= maxBytes) return joined

  const buffer = Buffer.from(joined, 'utf8')
  const slice = buffer.subarray(buffer.length - maxBytes)
  let start = 0
  // 10xxxxxx é byte de continuação: o primeiro caractere foi cortado.
  while (start < slice.length && (slice[start] & 0xc0) === 0x80) start += 1
  return slice.subarray(start).toString('utf8')
}

function redactFlags(flags) {
  const redacted = {}
  for (const [key, value] of Object.entries(flags)) {
    redacted[key] = typeof value === 'string' ? redactSecrets(value) : value
  }
  return redacted
}

export function buildFailureReceipt({
  command,
  exitCode,
  stdout = '',
  stderr = '',
  dirtyPaths = [],
  flags = {},
  cutoff = null,
  today = null,
} = {}) {
  const rawCommand = typeof command === 'string' && command.trim() !== '' ? command : 'desconhecido'
  return {
    schema: FAILURE_RECEIPT_SCHEMA,
    at: new Date().toISOString(),
    command: redactSecrets(rawCommand),
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    stdoutTail: truncateTail(redactSecrets(stdout)),
    stderrTail: truncateTail(redactSecrets(stderr)),
    dirtyPaths: Array.isArray(dirtyPaths) ? dirtyPaths.map((line) => String(line)) : [],
    flags: flags != null && typeof flags === 'object' ? redactFlags(flags) : {},
    cutoff: cutoff ?? null,
    today: today ?? null,
  }
}

/** ` M src/arquivo.ts` / `?? pasta/` → caminho puro, como `git checkout --` espera. */
export function parsePorcelainPath(line) {
  if (typeof line !== 'string' || line.length < 4) return null
  const rest = line.slice(3)
  const rename = rest.indexOf(' -> ')
  let path = rename >= 0 ? rest.slice(rename + 4) : rest
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1)
  return path.trim() === '' ? null : path
}

/**
 * Separa rastreados de não rastreados: `git checkout --` não remove arquivo
 * novo (snapshot da coleta), então a instrução precisa ser executável.
 */
function splitDirtyPaths(dirtyPaths) {
  const tracked = []
  const untracked = []
  for (const line of Array.isArray(dirtyPaths) ? dirtyPaths : []) {
    const path = parsePorcelainPath(line)
    if (path == null) continue
    if (String(line).startsWith('??')) untracked.push(path)
    else tracked.push(path)
  }
  return { tracked, untracked }
}

/**
 * Filtra as linhas de `git status --porcelain` para os caminhos cujo **conteúdo
 * mudou nesta execução**.
 *
 * `before`/`after` são snapshots `{ caminho: sha256 }` (ver `dataBaseline`). Um
 * caminho já sujo antes do updater rodar não pode ser atribuído a esta execução:
 * sugerir `git checkout --` nele descartaria trabalho de outra sessão.
 */
export function selectWrittenDirtyPaths(before, after, porcelainLines) {
  const changed = new Set(changedDataPaths(before, after))
  return (Array.isArray(porcelainLines) ? porcelainLines : [])
    .filter((line) => {
      const path = parsePorcelainPath(line)
      return path != null && changed.has(path)
    })
}

function firstFailingTestName(receipt) {
  for (const output of [receipt.stderrTail, receipt.stdoutTail]) {
    if (typeof output !== 'string' || output === '') continue
    for (const pattern of FAILED_TEST_PATTERNS) {
      const match = output.match(pattern)
      if (match) {
        const name = match[1].replace(/\s+\d+(?:\.\d+)?ms$/, '').trim()
        if (name !== '') return name
      }
    }
  }
  return null
}

/**
 * String única para a anotação `::error::` do GitHub Actions: sem quebras de
 * linha, com o comando que falhou, o exit code, o primeiro teste vermelho e a
 * instrução para restaurar a árvore.
 */
export function formatFailureMessage(receipt) {
  const command = receipt?.command ?? 'desconhecido'
  const exitCode = receipt?.exitCode ?? '?'
  const parts = [`updater falhou: ${command} (exit ${exitCode})`]

  const testName = firstFailingTestName(receipt ?? {})
  if (testName != null) parts.push(`teste: ${testName}`)

  const { tracked, untracked } = splitDirtyPaths(receipt?.dirtyPaths)
  const paths = [...tracked, ...untracked]

  if (paths.length === 0) {
    parts.push('nenhum caminho de dados sujo (nada a restaurar)')
  } else {
    parts.push(`caminhos sujos: ${paths.join(', ')}`)
    if (tracked.length > 0) parts.push(`restaure com: git checkout -- ${tracked.join(' ')}`)
    if (untracked.length > 0) parts.push(`remova com: rm -- ${untracked.join(' ')}`)
  }

  return `::error::${parts.join(' · ')}`
}

/** Remove os recibos mais antigos por nome (nome = timestamp UTC ordenável). */
function pruneFailureReceipts(directory) {
  const receipts = readdirSync(directory)
    .filter((file) => FAILURE_RECEIPT_FILE.test(file))
    .sort()
  for (let index = 0; index < receipts.length - MAX_FAILURE_RECEIPTS; index += 1) {
    rmSync(join(directory, receipts[index]), { force: true })
  }
}

/**
 * Grava o recibo em `<root>/.pantheon/logs/update-data-failure-<UTC>.json`.
 * `.pantheon/` é ignorado pelo git: o recibo é durável sem sujar a árvore.
 * O diretório mantém no máximo `MAX_FAILURE_RECEIPTS` recibos — os mais antigos
 * por nome saem; arquivos que não são recibo nunca são tocados.
 * Devolve o caminho absoluto do arquivo.
 */
export function writeFailureReceipt(root, receipt) {
  const at = receipt?.at
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
    throw new Error('writeFailureReceipt exige receipt.at (instante ISO)')
  }
  const directory = join(root, '.pantheon', 'logs')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `update-data-failure-${at.replace(/[-:.]/g, '')}.json`)
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`)
  pruneFailureReceipts(directory)
  return path
}
