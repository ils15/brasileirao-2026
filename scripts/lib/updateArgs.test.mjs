import { describe, expect, it } from 'vitest'
import { DEFAULT_TEST_COMMAND, isIsoDate, isIsoInstant, parseUpdateArgs } from './updateArgs.mjs'

describe('parseUpdateArgs — default da camada de contrato', () => {
  it('sem argumentos: escreve, roda `npm run test:data` e commita', () => {
    expect(parseUpdateArgs([])).toEqual({
      dryRun: false,
      offline: false,
      today: null,
      cutoff: null,
      testCommand: DEFAULT_TEST_COMMAND,
      noCommit: false,
      noProjections: false,
    })
    expect(DEFAULT_TEST_COMMAND).toBe('npm run test:data')
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

describe('parseUpdateArgs — --cutoff', () => {
  it('aceita um instante UTC no formato do pacote e devolve exatamente a string recebida', () => {
    const cutoff = '2026-11-19T13:05:52Z'
    expect(parseUpdateArgs([`--cutoff=${cutoff}`]).cutoff).toBe(cutoff)
  })

  it('rejeita formato malformado com mensagem que cita a flag', () => {
    const malformed = ['2026-11-19', '19/11/2026', '2026-11-19T13:05:52', '2026-11-19T13:05Z', '2026-11-19 13:05:52Z', '']
    for (const value of malformed) {
      expect(() => parseUpdateArgs([`--cutoff=${value}`])).toThrow(/--cutoff inválido/)
    }
  })

  it('rejeita data de calendário inválida ou hora fora do dia', () => {
    const impossible = ['2026-02-30T00:00:00Z', '2026-11-19T24:00:00Z', '2026-11-19T23:60:00Z']
    for (const value of impossible) {
      expect(() => parseUpdateArgs([`--cutoff=${value}`])).toThrow(/--cutoff inválido/)
    }
  })

  it('rejeita corte posterior ao dia de --today e aceita o mesmo dia', () => {
    const today = '2026-11-19'
    const afterToday = '2026-11-20T00:00:00Z'
    const sameDay = '2026-11-19T23:59:59Z'
    const nextDay = '2026-11-20'
    expect(() => parseUpdateArgs([`--cutoff=${afterToday}`, `--today=${today}`])).toThrow(/posterior a --today/)
    expect(parseUpdateArgs([`--cutoff=${sameDay}`, `--today=${today}`]).cutoff).toBe(sameDay)
    expect(parseUpdateArgs([`--cutoff=${sameDay}`, `--today=${nextDay}`]).today).toBe(nextDay)
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

describe('parseUpdateArgs — --no-projections', () => {
  it('default gera public/projecoes.json; a flag desliga só essa etapa', () => {
    expect(parseUpdateArgs([]).noProjections).toBe(false)
    expect(parseUpdateArgs(['--no-projections']).noProjections).toBe(true)
    expect(parseUpdateArgs(['--offline', '--no-commit', '--no-projections'])).toMatchObject({
      offline: true,
      noCommit: true,
      noProjections: true,
    })
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

describe('isIsoInstant', () => {
  it('aceita somente o instante UTC exato do pacote', () => {
    const valid = '2026-11-19T13:05:52Z'
    const invalid = [
      `${valid}\n`,
      '2026-11-19T13:05:52.000Z',
      '2026-11-19T13:05:52+00:00',
      '2026-02-30T13:05:52Z',
      undefined,
    ]
    expect(isIsoInstant(valid)).toBe(true)
    for (const value of invalid) {
      expect(isIsoInstant(value)).toBe(false)
    }
  })
})
