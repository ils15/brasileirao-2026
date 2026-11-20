/**
 * Contrato do recibo de falha do updater.
 *
 * O recibo é o artefato durável que sobra quando o updater aborta depois de
 * escrever módulos: sem ele, a árvore suja não tem diagnóstico. Aqui nada toca
 * o repo real — a escrita acontece em `tmpdir`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FAILURE_RECEIPT_SCHEMA,
  MAX_FAILURE_RECEIPTS,
  TAIL_MAX_BYTES,
  TAIL_MAX_LINES,
  buildFailureReceipt,
  formatFailureMessage,
  parsePorcelainPath,
  redactSecrets,
  selectWrittenDirtyPaths,
  truncateTail,
  writeFailureReceipt,
} from './updateFailure.mjs'

const requiredKeys = [
  'schema',
  'at',
  'command',
  'exitCode',
  'stdoutTail',
  'stderrTail',
  'dirtyPaths',
  'flags',
  'cutoff',
  'today',
]

const CUTOFF = '2026-11-19T13:05:52Z'

function receipt(overrides = {}) {
  return buildFailureReceipt({
    command: 'npm run test:data',
    exitCode: 1,
    stdout: 'linha de saída',
    stderr: 'linha de erro',
    dirtyPaths: [' M src/currentSeasonResults.ts'],
    flags: { dryRun: false, offline: true },
    cutoff: CUTOFF,
    today: '2026-11-20',
    ...overrides,
  })
}

describe('buildFailureReceipt', () => {
  it('devolve exatamente os campos do contrato, sem serializar process.env', () => {
    const built = receipt()
    expect(Object.keys(built).sort()).toEqual([...requiredKeys].sort())
    expect(built.schema).toBe(FAILURE_RECEIPT_SCHEMA)
    expect(Number.isNaN(Date.parse(built.at))).toBe(false)
    expect(built.at.endsWith('Z')).toBe(true)
    expect(built.command).toBe('npm run test:data')
    expect(built.exitCode).toBe(1)
    expect(built.stdoutTail).toBe('linha de saída')
    expect(built.stderrTail).toBe('linha de erro')
    expect(built.dirtyPaths).toEqual([' M src/currentSeasonResults.ts'])
    expect(built.flags).toEqual({ dryRun: false, offline: true })
    expect(built.cutoff).toBe(CUTOFF)
    expect(built.today).toBe('2026-11-20')
    expect(JSON.stringify(built)).not.toContain(process.env.HOME)
  })

  it('normaliza ausências sem inventar valores', () => {
    const built = buildFailureReceipt({})
    expect(built.command).toBe('desconhecido')
    expect(built.exitCode).toBeNull()
    expect(built.stdoutTail).toBe('')
    expect(built.stderrTail).toBe('')
    expect(built.dirtyPaths).toEqual([])
    expect(built.flags).toEqual({})
    expect(built.cutoff).toBeNull()
    expect(built.today).toBeNull()
  })

  it('nunca copia o ambiente inteiro para os flags', () => {
    const built = receipt({ flags: { dryRun: true } })
    expect(built.flags).toEqual({ dryRun: true })
    expect(JSON.stringify(built)).not.toMatch(/"PATH":/)
  })
})

describe('redaction', () => {
  it('remove valores de chave, token, segredo e senha', () => {
    const raw = [
      'API_KEY=chave-secreta-123',
      'GITHUB_TOKEN=ghp_abcdef',
      'DB_SECRET=segredo-brutal',
      'PASSWORD=hunter2',
      'resto preservado',
    ].join('\n')
    const clean = redactSecrets(raw)
    for (const secret of ['chave-secreta-123', 'ghp_abcdef', 'segredo-brutal', 'hunter2']) {
      expect(clean).not.toContain(secret)
    }
    expect(clean).toContain('API_KEY=[REDACTED]')
    expect(clean).toContain('GITHUB_TOKEN=[REDACTED]')
    expect(clean).toContain('DB_SECRET=[REDACTED]')
    expect(clean).toContain('PASSWORD=[REDACTED]')
    expect(clean).toContain('resto preservado')
  })

  it('remove o valor de Authorization, com ou sem esquema', () => {
    const raw = ['Authorization: Bearer abc.def.ghi', 'authorization: Basic dXNlcjpwYXNz'].join('\n')
    const clean = redactSecrets(raw)
    expect(clean).not.toContain('abc.def.ghi')
    expect(clean).not.toContain('dXNlcjpwYXNz')
    expect(clean).toContain('Authorization: [REDACTED]')
    expect(clean).toContain('authorization: [REDACTED]')
  })

  it('o recibo redige as duas caudas antes de persistir', () => {
    const built = receipt({
      stdout: 'TOKEN=abcdef\nsaída comum',
      stderr: 'Authorization: Bearer xyz\nFAIL  src/a.test.tsx > caso > falhou',
    })
    expect(JSON.stringify(built)).not.toContain('abcdef')
    expect(JSON.stringify(built)).not.toContain('Bearer xyz')
    expect(built.stderrTail).toContain('caso > falhou')
  })

  it('redige também o comando e strings de flags', () => {
    const built = receipt({ command: 'gate API_KEY=abc', flags: { test: 'TOKEN=xyz', dryRun: false } })
    expect(built.command).toBe('gate API_KEY=[REDACTED]')
    expect(built.flags).toEqual({ test: 'TOKEN=[REDACTED]', dryRun: false })
  })
})

describe('truncateTail', () => {
  it('mantém só as últimas linhas', () => {
    const text = Array.from({ length: TAIL_MAX_LINES + 50 }, (_, index) => `linha ${index + 1}`).join('\n')
    const tail = truncateTail(text)
    const lines = tail.split('\n')
    expect(lines).toHaveLength(TAIL_MAX_LINES)
    expect(lines[0]).toBe(`linha ${51}`)
    expect(lines.at(-1)).toBe(`linha ${TAIL_MAX_LINES + 50}`)
  })

  it('respeita o teto de bytes mesmo com uma linha gigante', () => {
    const tail = truncateTail('a'.repeat(TAIL_MAX_BYTES * 2))
    expect(Buffer.byteLength(tail, 'utf8')).toBeLessThanOrEqual(TAIL_MAX_BYTES)
    expect(tail.length).toBeGreaterThan(0)
  })

  it('não corta um caractere multibyte ao meio', () => {
    const tail = truncateTail('ç'.repeat(TAIL_MAX_BYTES))
    expect(Buffer.byteLength(tail, 'utf8')).toBeLessThanOrEqual(TAIL_MAX_BYTES)
    expect(tail).not.toContain('\uFFFD')
  })
})

describe('formatFailureMessage', () => {
  const dirtyPaths = [' M src/currentSeasonResults.ts', '?? data/source-snapshots/espn-scoreboard-2026-11-20.json']

  it('nomeia comando, exit, primeiro teste que falhou e restauração', () => {
    const built = receipt({
      stderr: [
        ' FAIL  src/exemplo.test.tsx > painel > mostra o total',
        'AssertionError: expected 1 to be 2',
      ].join('\n'),
      dirtyPaths,
    })
    const message = formatFailureMessage(built)
    expect(message.startsWith('::error::')).toBe(true)
    expect(message).not.toContain('\n')
    expect(message).toContain('npm run test:data')
    expect(message).toContain('exit 1')
    expect(message).toContain('painel > mostra o total')
    expect(message).toContain('src/currentSeasonResults.ts')
    expect(message).toContain('git checkout -- src/currentSeasonResults.ts')
    expect(message).toContain('rm -- data/source-snapshots/espn-scoreboard-2026-11-20.json')
  })

  it('funciona sem teste identificável e sem caminhos sujos', () => {
    const built = receipt({ stderr: 'erro sem relatório de teste', dirtyPaths: [] })
    const message = formatFailureMessage(built)
    expect(message).toContain('npm run test:data')
    expect(message).not.toContain('teste:')
    expect(message).toContain('nenhum caminho de dados sujo')
    expect(message).not.toContain('git checkout --')
  })
})

describe('selectWrittenDirtyPaths', () => {
  const preExistingDirty = ' M src/advancedStats2026.ts'
  const ownWrite = ' M src/currentSeasonResults.ts'
  const createdSnapshot = '?? data/source-snapshots/espn-scoreboard-2026-11-20.json'
  const baseline = {
    'src/advancedStats2026.ts': 'ja-sujo-antes',
    'src/currentSeasonResults.ts': 'antes',
  }

  it('pré-existente sujo + falha: o caminho não entra como escrito', () => {
    const current = { ...baseline }
    const written = selectWrittenDirtyPaths(baseline, current, [preExistingDirty, ownWrite])

    expect(written).toEqual([])
    const message = formatFailureMessage(receipt({ dirtyPaths: written }))
    expect(message).not.toContain('src/advancedStats2026.ts')
    expect(message).not.toContain('git checkout --')
    expect(message).toContain('nenhum caminho de dados sujo')
  })

  it('escrita própria + falha: lista, sugere restauração e ignora a sujeira antiga', () => {
    const current = {
      'src/advancedStats2026.ts': 'ja-sujo-antes',
      'src/currentSeasonResults.ts': 'depois',
    }
    const written = selectWrittenDirtyPaths(baseline, current, [preExistingDirty, ownWrite])

    expect(written).toEqual([ownWrite])
    const message = formatFailureMessage(receipt({ dirtyPaths: written }))
    expect(message).toContain('git checkout -- src/currentSeasonResults.ts')
    expect(message).not.toContain('src/advancedStats2026.ts')
  })

  it('snapshot criado nesta execução vira `??` e a instrução é `rm --`', () => {
    const current = { ...baseline, 'data/source-snapshots/espn-scoreboard-2026-11-20.json': 'novo' }
    const written = selectWrittenDirtyPaths(baseline, current, [preExistingDirty, createdSnapshot])

    expect(written).toEqual([createdSnapshot])
    const message = formatFailureMessage(receipt({ dirtyPaths: written }))
    expect(message).toContain('rm -- data/source-snapshots/espn-scoreboard-2026-11-20.json')
    expect(message).not.toContain('git checkout --')
  })

  it('dry-run sem escrita: nenhum caminho escrito, nenhuma sugestão de checkout', () => {
    const written = selectWrittenDirtyPaths(baseline, { ...baseline }, [preExistingDirty])

    expect(written).toEqual([])
    const message = formatFailureMessage(receipt({ dirtyPaths: written, flags: { dryRun: true } }))
    expect(message).not.toContain('git checkout')
    expect(message).not.toContain('rm --')
  })

  it('parsePorcelainPath normaliza rename e aspas', () => {
    expect(parsePorcelainPath(' M src/a.ts')).toBe('src/a.ts')
    expect(parsePorcelainPath('?? data/source-snapshots/a.json')).toBe('data/source-snapshots/a.json')
    expect(parsePorcelainPath('R  src/velho.ts -> src/novo.ts')).toBe('src/novo.ts')
    expect(parsePorcelainPath(' M "src/com espaço.ts"')).toBe('src/com espaço.ts')
  })
})

describe('writeFailureReceipt', () => {
  it('grava o recibo em .pantheon/logs sob a raiz informada', () => {
    const root = mkdtempSync(join(tmpdir(), 'update-failure-'))
    try {
      const built = receipt()
      const path = writeFailureReceipt(root, built)
      expect(path.startsWith(join(root, '.pantheon', 'logs'))).toBe(true)
      expect(path.endsWith('.json')).toBe(true)
      expect(path).toContain('update-data-failure-')
      expect(existsSync(path)).toBe(true)
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      expect(parsed).toEqual(built)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('recusa um recibo sem carimbo de tempo', () => {
    const root = mkdtempSync(join(tmpdir(), 'update-failure-'))
    try {
      expect(() => writeFailureReceipt(root, { schema: 1 })).toThrow(/at/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it(`retenção: mantém no máximo ${MAX_FAILURE_RECEIPTS} recibos, descartando os mais antigos`, () => {
    const root = mkdtempSync(join(tmpdir(), 'update-failure-'))
    const logsDir = join(root, '.pantheon', 'logs')
    try {
      for (let index = 0; index < 25; index += 1) {
        const at = new Date(Date.UTC(2026, 10, 1, 0, 0, index)).toISOString()
        writeFailureReceipt(root, { ...receipt(), at })
      }
      writeFileSync(join(logsDir, 'nota.txt'), 'não é recibo')
      writeFailureReceipt(root, { ...receipt(), at: new Date(Date.UTC(2026, 10, 2, 0, 0, 0)).toISOString() })

      const receipts = readdirSync(logsDir).filter((file) => /^update-data-failure-.+\.json$/.test(file)).sort()
      expect(receipts).toHaveLength(MAX_FAILURE_RECEIPTS)
      // Os 6 mais antigos saíram: o primeiro restante é o índice 6 do lote inicial.
      expect(receipts[0]).toContain('20261101T000006000Z')
      expect(receipts.at(-1)).toContain('20261102T000000000Z')
      expect(existsSync(join(logsDir, 'nota.txt'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
