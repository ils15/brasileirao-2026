import { describe, expect, it } from 'vitest'
import { DEFAULT_TEST_COMMAND, isIsoDate, parseUpdateArgs } from './updateArgs.mjs'

describe('parseUpdateArgs — default preserva o comportamento atual', () => {
  it('sem argumentos: escreve, roda `npm test` e commita', () => {
    expect(parseUpdateArgs([])).toEqual({
      dryRun: false,
      offline: false,
      today: null,
      testCommand: DEFAULT_TEST_COMMAND,
      noCommit: false,
    })
    expect(DEFAULT_TEST_COMMAND).toBe('npm test')
  })
})

describe('parseUpdateArgs — --today', () => {
  it('aceita uma data do calendário e devolve exatamente a string recebida', () => {
    expect(parseUpdateArgs(['--today=2026-11-16']).today).toBe('2026-11-16')
  })

  it('rejeita formato malformado com mensagem que cita a flag', () => {
    for (const value of ['16/11/2026', '2026-2-3', '2026-11', 'hoje', '']) {
      expect(() => parseUpdateArgs([`--today=${value}`])).toThrow(/--today inválido/)
    }
  })

  it('rejeita data sintaticamente válida mas fora do calendário', () => {
    expect(() => parseUpdateArgs(['--today=2026-02-30'])).toThrow(/--today inválido/)
    expect(() => parseUpdateArgs(['--today=2026-13-01'])).toThrow(/--today inválido/)
  })
})

describe('parseUpdateArgs — --test', () => {
  it('aceita um comando arbitrário e faz trim das bordas', () => {
    expect(parseUpdateArgs(['--test=  npx vitest run src/a.test.tsx  ']).testCommand)
      .toBe('npx vitest run src/a.test.tsx')
  })

  it('rejeita comando vazio ou só espaços', () => {
    expect(() => parseUpdateArgs(['--test='])).toThrow(/--test requer um comando não vazio/)
    expect(() => parseUpdateArgs(['--test=   '])).toThrow(/--test requer um comando não vazio/)
  })
})

describe('parseUpdateArgs — --offline e --no-commit', () => {
  it('--offline escreve (não é dry-run) e pode combinar com --no-commit', () => {
    const options = parseUpdateArgs(['--offline', '--no-commit', '--today=2026-11-16'])
    expect(options).toMatchObject({ dryRun: false, offline: true, noCommit: true, today: '2026-11-16' })
  })

  it('rejeita --dry-run com --no-commit em vez de escolher um silenciosamente', () => {
    expect(() => parseUpdateArgs(['--dry-run', '--no-commit'])).toThrow(/incompatíveis/)
  })
})

describe('parseUpdateArgs — argumentos desconhecidos', () => {
  it('falha alto em vez de ignorar uma flag com erro de digitação', () => {
    expect(() => parseUpdateArgs(['--dryrun'])).toThrow(/Argumento desconhecido: --dryrun/)
    expect(() => parseUpdateArgs(['--today'])).toThrow(/Argumento desconhecido: --today/)
  })
})

describe('isIsoDate', () => {
  it('distingue datas reais de datas plausíveis', () => {
    const instantWithTime = '2026-11-16T00:00:00Z'
    expect(isIsoDate('2026-11-16')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate(instantWithTime)).toBe(false)
    expect(isIsoDate(undefined)).toBe(false)
  })
})
