import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  completedKickoffsFromScoreboard,
  expectedResultPending,
  isStale,
  stalenessHours,
} from './freshness.mjs'

// data-fixa: fixture sintética — instante inventado, não o corte vigente (esse
// vem de src/sourceMetadata.ts). Datas derivadas por aritmética para o teste
// não depender do relógio nem do pacote.
const CUTOFF = '2026-01-05T12:00:00Z'
const CUTOFF_MS = Date.parse(CUTOFF)
const HOUR_MS = 3_600_000
const at = (offsetHours) => new Date(CUTOFF_MS + offsetHours * HOUR_MS).toISOString()

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CLI_PATH = join(ROOT, 'scripts/check-data-freshness.mjs')

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** Scoreboard sintético no formato do payload da ESPN (`events[]`). */
function scoreboard(events) {
  return {
    provider: { name: 'fixture' },
    leagues: [{ id: '630', calendar: [] }],
    events: events.map(({ kickoffHours, state }) => {
      const date = at(kickoffHours)
      const type = { state, completed: state === 'post' }
      return { id: `fixture-${kickoffHours}-${state}`, date, status: { type }, competitions: [{ date, status: { type } }] }
    }),
  }
}

/** Diretório temporário com snapshots `espn-scoreboard-*.json`. */
function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'br2026-freshness-'))
  tempDirs.push(dir)
  for (const [name, payload] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(payload))
  return dir
}

function runCli({ nowHours, dir, extra = [] }) {
  return spawnSync(
    process.execPath,
    [CLI_PATH, `--cutoff=${CUTOFF}`, `--now=${at(nowHours)}`, '--max-age-hours=24', `--snapshots-dir=${dir}`, ...extra],
    { encoding: 'utf8' },
  )
}

describe('stalenessHours', () => {
  it('agora anterior ao corte devolve horas negativas (relógio adiantado, não defasagem)', () => {
    const hours = stalenessHours({ cutoffUtc: CUTOFF, now: at(-1) })
    expect(hours).toBeCloseTo(-1, 6)
    expect(isStale({ cutoffUtc: CUTOFF, now: at(-1), maxAgeHours: 24 })).toBe(false)
  })

  it('calcula horas decimais entre corte e agora', () => {
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: at(3) })).toBeCloseTo(3, 6)
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: at(1.5) })).toBeCloseTo(1.5, 6)
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: at(130.9) })).toBeCloseTo(130.9, 6)
  })

  it('aceita Date e epoch-ms além de string ISO', () => {
    expect(stalenessHours({ cutoffUtc: new Date(CUTOFF_MS), now: at(1.5) })).toBeCloseTo(1.5, 6)
    expect(stalenessHours({ cutoffUtc: CUTOFF_MS, now: CUTOFF_MS + 90 * 60 * 1000 })).toBeCloseTo(1.5, 6)
  })

  it('data inválida devolve null (primitiva tolerante)', () => {
    expect(stalenessHours({ cutoffUtc: 'ontem', now: at(1) })).toBeNull()
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: 'não é data' })).toBeNull()
    expect(stalenessHours({ cutoffUtc: CUTOFF, now: 'Invalid Date' })).toBeNull()
    expect(stalenessHours({ cutoffUtc: undefined, now: at(1) })).toBeNull()
    expect(stalenessHours({ cutoffUtc: null, now: at(1) })).toBeNull()
    expect(stalenessHours({ cutoffUtc: Number.NaN, now: at(1) })).toBeNull()
  })
})

describe('isStale', () => {
  it('exatamente no limiar já conta como defasado (limite inclusivo)', () => {
    const now = at(24)
    expect(stalenessHours({ cutoffUtc: CUTOFF, now })).toBeCloseTo(24, 6)
    expect(isStale({ cutoffUtc: CUTOFF, now, maxAgeHours: 24 })).toBe(true)
  })

  it('logo abaixo do limiar é fresco', () => {
    const now = at(24 - 1 / 3600) // 23h59m59s
    expect(isStale({ cutoffUtc: CUTOFF, now, maxAgeHours: 24 })).toBe(false)
  })

  it('acima do limiar é defasado', () => {
    expect(isStale({ cutoffUtc: CUTOFF, now: at(25), maxAgeHours: 24 })).toBe(true)
    expect(isStale({ cutoffUtc: CUTOFF, now: at(130.9), maxAgeHours: 24 })).toBe(true)
  })

  it('respeita maxAgeHours como parâmetro, não como constante', () => {
    expect(isStale({ cutoffUtc: CUTOFF, now: at(24), maxAgeHours: 24.0001 })).toBe(false)
    expect(isStale({ cutoffUtc: CUTOFF, now: at(24), maxAgeHours: 12 })).toBe(true)
  })

  it('data inválida lança — nunca vira "fresco"', () => {
    expect(() => isStale({ cutoffUtc: 'ontem', now: at(1), maxAgeHours: 24 }))
      .toThrow(/corte analítico inválido/)
    expect(() => isStale({ cutoffUtc: CUTOFF, now: 'não é data', maxAgeHours: 24 }))
      .toThrow(/corte analítico inválido/)
  })

  it('corte ausente lança', () => {
    expect(() => isStale({ now: at(1), maxAgeHours: 24 })).toThrow(/corte analítico inválido/)
    expect(() => isStale({ cutoffUtc: '', now: at(1), maxAgeHours: 24 })).toThrow(/corte analítico inválido/)
    expect(() => isStale({ cutoffUtc: null, now: at(1), maxAgeHours: 24 })).toThrow(/corte analítico inválido/)
  })

  it('maxAgeHours inválido lança', () => {
    for (const maxAgeHours of [-1, Number.NaN, Number.POSITIVE_INFINITY, '24']) {
      expect(() => isStale({ cutoffUtc: CUTOFF, now: at(1), maxAgeHours })).toThrow(/maxAgeHours inválido/)
    }
  })
})

describe('completedKickoffsFromScoreboard', () => {
  it('só evento encerrado vira evidência; agendado é ignorado', () => {
    const payload = scoreboard([
      { kickoffHours: 30, state: 'post' },
      { kickoffHours: 24, state: 'pre' },
      { kickoffHours: -12, state: 'post' },
    ])
    expect(completedKickoffsFromScoreboard(payload)).toEqual([at(-12), at(30)])
  })

  it('payload sem events ou evento sem data não quebra', () => {
    expect(completedKickoffsFromScoreboard({})).toEqual([])
    expect(completedKickoffsFromScoreboard({ events: [{ status: { type: { state: 'post' } } }] })).toEqual([])
  })
})

describe('expectedResultPending', () => {
  it('entressafra de 10 dias sem jogo encerrado não é pendência', () => {
    const now = at(240)
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now, kickoffs: [at(-48), at(-6)] })).toBe(false)
  })

  it('sem kickoffs informados não afirma pendência', () => {
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(240) })).toBe(false)
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(240), kickoffs: [] })).toBe(false)
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(240), kickoffs: null })).toBe(false)
  })

  it('jogo encerrado 12h atrás sem resultado é pendência', () => {
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(24), kickoffs: [at(12)] })).toBe(true)
  })

  it('kickoff dentro da carência ainda não é atraso (limite inclusivo em now-6h)', () => {
    const now = at(24)
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now, kickoffs: [at(21)] })).toBe(false) // 3h
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now, kickoffs: [at(18.1)] })).toBe(false) // 5.9h
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now, kickoffs: [at(18)] })).toBe(true) // exatamente 6h
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now, kickoffs: [at(17.9)] })).toBe(true) // 6.1h
  })

  it('kickoff anterior ao corte já está no pacote', () => {
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(240), kickoffs: [at(-1)] })).toBe(false)
  })

  it('graceHours é parâmetro, não constante', () => {
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(24), kickoffs: [at(12)], graceHours: 18 })).toBe(false)
    expect(expectedResultPending({ cutoffUtc: CUTOFF, now: at(24), kickoffs: [at(12)], graceHours: 0 })).toBe(true)
  })

  it('entrada ilegível lança — nunca vira "sem pendência"', () => {
    expect(() => expectedResultPending({ cutoffUtc: 'ontem', now: at(1), kickoffs: [at(0)] })).toThrow(/corte analítico inválido/)
    expect(() => expectedResultPending({ cutoffUtc: CUTOFF, now: 'não é data', kickoffs: [] })).toThrow(/corte analítico inválido/)
    expect(() => expectedResultPending({ cutoffUtc: CUTOFF, now: at(1), kickoffs: 'x' })).toThrow(/kickoffs deve ser uma lista/)
    for (const graceHours of [-1, Number.NaN, Number.POSITIVE_INFINITY, '6']) {
      expect(() => expectedResultPending({ cutoffUtc: CUTOFF, now: at(24), kickoffs: [at(12)], graceHours }))
        .toThrow(/graceHours inválido/)
    }
  })
})

describe('check-data-freshness (CLI)', () => {
  it('entressafra de 10 dias sai 0 com notice, não com error', () => {
    const dir = fixtureDir({
      'espn-scoreboard-2026-01-06.json': scoreboard([
        { kickoffHours: -48, state: 'post' }, // já incorporado ao corte
        { kickoffHours: 24, state: 'pre' }, // agendado que nunca virou resultado
      ]),
    })
    const result = runCli({ nowHours: 240, dir })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('::notice::')
    expect(result.stdout).toContain('entressafra')
    expect(result.stdout).not.toContain('::error::')
  })

  it('jogo encerrado 12h atrás sem resultado sai 1', () => {
    const dir = fixtureDir({
      'espn-scoreboard-2026-01-07.json': scoreboard([{ kickoffHours: 30, state: 'post' }]),
    })
    // agora = kickoff + 12h; idade do corte = 42h > limite de 24h
    const result = runCli({ nowHours: 42, dir })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::')
    expect(result.stdout).toContain('partida encerrada')
    expect(result.stdout).toContain('sem resultado no pacote')
  })

  it('--ignore-calendar restaura a decisão por idade crua', () => {
    const dir = fixtureDir({
      'espn-scoreboard-2026-01-06.json': scoreboard([{ kickoffHours: -48, state: 'post' }]),
    })
    const result = runCli({ nowHours: 240, dir, extra: ['--ignore-calendar'] })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('--ignore-calendar')
    expect(result.stdout).toContain('::error::')
  })

  it('sem calendário legível volta ao comportamento antigo com ::warning::', () => {
    const dir = fixtureDir({})
    const result = runCli({ nowHours: 48, dir })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::warning::')
    expect(result.stdout).toContain('idade crua')
    expect(result.stdout).toContain('::error::')
  })

  it('pacote fresco sai 0 sem consultar o calendário', () => {
    const result = runCli({ nowHours: 2, dir: join(tmpdir(), 'br2026-freshness-inexistente') })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('em dia')
    expect(result.stdout).not.toContain('::warning::')
  })

  it('erro de parsing continua saindo 2', () => {
    const result = spawnSync(process.execPath, [CLI_PATH, '--cutoff=ontem', `--now=${at(1)}`], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stdout).toContain('::error::')
  })
})
