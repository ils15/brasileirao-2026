import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { refreshEspnScorers, resolveEventId, snapshotsSha } from './refresh-espn-scorers.mjs'

const ROOT = process.cwd()
const FIXTURE_TEXT = readFileSync(join(ROOT, 'data/fixtures/espn-summary-401841315.json'), 'utf8')

const INDEX_PAYLOAD = {
  events: [
    {
      id: '401841315',
      status: { type: { state: 'post', completed: true } },
      competitions: [
        {
          id: '401841315',
          date: '2026-11-18T22:30Z',
          status: { type: { state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '0', team: { displayName: 'Coritiba' } },
            { homeAway: 'away', score: '1', team: { displayName: 'Santos' } },
          ],
        },
      ],
    },
    {
      id: '401841399',
      status: { type: { state: 'post', completed: true } },
      competitions: [
        {
          id: '401841399',
          date: '2026-11-19T00:00Z',
          status: { type: { state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '1', team: { displayName: 'Flamengo' } },
            { homeAway: 'away', score: '2', team: { displayName: 'Coritiba' } },
          ],
        },
      ],
    },
  ],
}

function stubFetch({ failingEventIds = [], summaryText = FIXTURE_TEXT, summaries = {}, indexPayload = INDEX_PAYLOAD } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.includes('/scoreboard')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(indexPayload) }
    }
    if (failingEventIds.some((eventId) => url.includes(`event=${eventId}`))) {
      return { ok: false, status: 429, text: async () => '' }
    }
    const eventId = url.match(/event=(\d+)/)?.[1]
    return { ok: true, status: 200, text: async () => summaries[eventId] ?? summaryText }
  }
  return { calls, fetchImpl }
}

const RESULT = { home: 'coritiba', away: 'santos', homeGoals: 0, awayGoals: 1, kickoff: '2026-11-18T22:30Z', source: 'espn', sourceRef: '401841315' }
const SECOND_RESULT = { home: 'flamengo', away: 'coritiba', homeGoals: 1, awayGoals: 2, kickoff: '2026-11-19T00:00Z', source: 'espn', sourceRef: '401841399' }

/** Summary sintético do segundo jogo (mesmo shape mínimo que o parser exige). */
const SECOND_SUMMARY = JSON.stringify({
  header: {
    competitions: [{
      id: '401841399',
      date: '2026-11-19T00:00Z',
      status: { type: { state: 'post', completed: true } },
      competitors: [
        { homeAway: 'home', team: { displayName: 'Flamengo' }, score: '1' },
        { homeAway: 'away', team: { displayName: 'Coritiba' }, score: '2' },
      ],
    }],
  },
  keyEvents: [
    { id: 'a', type: { id: '80', text: 'Goal', type: 'goal' }, clock: { displayValue: "12'" }, team: { displayName: 'Flamengo' }, participants: [{ athlete: { displayName: 'Pedro' } }] },
    { id: 'b', type: { id: '80', text: 'Goal', type: 'goal' }, clock: { displayValue: "40'" }, team: { displayName: 'Coritiba' }, participants: [{ athlete: { displayName: 'Lucas Ronier' } }] },
    { id: 'c', type: { id: '80', text: 'Goal', type: 'goal' }, clock: { displayValue: "70'" }, team: { displayName: 'Coritiba' }, participants: [{ athlete: { displayName: 'Josué' } }] },
  ],
})

function tempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'espn-scorers-'))
  return { snapshotsDir: dir, modulePath: join(dir, 'scorers2026.ts') }
}

describe('resolveEventId', () => {
  it('exige par idêntico, evento encerrado e placar igual ao empacotado', () => {
    const byPair = new Map([
      [
        'coritiba:santos',
        [
          { eventId: '1', completed: false, homeScore: 0, awayScore: 0 },
          { eventId: '2', completed: true, homeScore: 0, awayScore: 1 },
        ],
      ],
    ])
    expect(resolveEventId(byPair, RESULT)).toBe('2')
    expect(resolveEventId(byPair, { ...RESULT, awayGoals: 3 })).toBeNull()
    expect(resolveEventId(byPair, { ...RESULT, home: 'bahia' })).toBeNull()
  })
})

describe('refreshEspnScorers', () => {
  it('grava snapshot normalizado por partida e regenera o módulo', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    const { calls, fetchImpl } = stubFetch()
    const lines = []

    const outcome = await refreshEspnScorers({
      results: [RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl,
      allowNetwork: true,
      log: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    })

    expect(outcome.written).toBe(true)
    expect(outcome.coverage.matchesCovered).toBe(1)
    expect(outcome.coverage.goalsInPackage).toBe(1)
    expect(outcome.coverage.goalsAttributed).toBe(1)
    expect(readdirSync(snapshotsDir).filter((file) => file.startsWith('espn-events-'))).toEqual([
      'espn-events-401841315.json',
    ])

    const snapshot = JSON.parse(readFileSync(join(snapshotsDir, 'espn-events-401841315.json'), 'utf8'))
    expect(snapshot.eventId).toBe('401841315')
    expect(snapshot.source).toBe('ESPN')
    expect(snapshot.goals).toHaveLength(1)

    const moduleText = readFileSync(modulePath, 'utf8')
    expect(moduleText).toContain("name: 'ESPN (eventos de partida)'")
    expect(moduleText).toContain("assists: 'unavailable'")
    expect(moduleText).toContain(`{ name: 'Gabriel Barbosa', club: 'santos', goals: 1 }`)
    // Índice do scoreboard também vira snapshot auditável (uma vez).
    expect(readdirSync(snapshotsDir)).toContain('espn-event-index-2026.json')
    expect(calls.filter((url) => url.includes('/summary'))).toHaveLength(1)
  })

  it('é idempotente: partida já capturada não é refeita nem sobrescrita', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    const first = stubFetch()
    await refreshEspnScorers({ results: [RESULT], snapshotsDir, modulePath, fetchImpl: first.fetchImpl, log: () => {}, warn: () => {} })
    const snapshotText = readFileSync(join(snapshotsDir, 'espn-events-401841315.json'), 'utf8')

    const second = stubFetch()
    const outcome = await refreshEspnScorers({
      results: [RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl: second.fetchImpl,
      log: () => {},
      warn: () => {},
    })

    expect(second.calls.filter((url) => url.includes('/summary'))).toHaveLength(0)
    expect(outcome.captured).toBe(0)
    expect(readFileSync(join(snapshotsDir, 'espn-events-401841315.json'), 'utf8')).toBe(snapshotText)
  })

  it('resultado novo no mesmo dia atualiza a artilharia e cresce a cobertura', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    const first = await refreshEspnScorers({
      results: [RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl: stubFetch().fetchImpl,
      log: () => {},
      warn: () => {},
    })
    expect(first.written).toBe(true)
    expect(first.coverage.matchesCovered).toBe(1)
    const before = readFileSync(modulePath, 'utf8')

    const { calls, fetchImpl } = stubFetch({ summaries: { '401841399': SECOND_SUMMARY } })
    const second = await refreshEspnScorers({
      results: [RESULT, SECOND_RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl,
      log: () => {},
      warn: () => {},
    })

    expect(second.written).toBe(true)
    expect(second.coverage.matchesCovered).toBe(2)
    expect(second.coverage.goalsInPackage).toBe(4)
    expect(calls.filter((url) => url.includes('/summary'))).toHaveLength(1)
    const after = readFileSync(modulePath, 'utf8')
    expect(after).not.toBe(before)
    expect(after).toContain('matchesCovered: 2')
    expect(after).toContain("{ name: 'Pedro', club: 'flamengo', goals: 1 }")
  })

  it('falha de uma partida emite ::warning:: com o eventId e mantém o snapshot anterior', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    writeFileSync(
      join(snapshotsDir, 'espn-events-401841315.json'),
      `${JSON.stringify(
        {
          source: 'ESPN',
          eventId: '401841315',
          fetchedAt: 'instante-anterior',
          home: 'coritiba',
          away: 'santos',
          homeGoals: 0,
          awayGoals: 1,
          goals: [{ athlete: 'Gabriel Barbosa', club: 'santos', minute: "90'+2'", penalty: false }],
          ownGoals: [],
          cards: [],
          unresolved: [],
        },
        null,
        1,
      )}\n`,
    )
    const warnings = []
    const outcome = await refreshEspnScorers({
      results: [{ home: 'flamengo', away: 'coritiba', homeGoals: 1, awayGoals: 2, kickoff: '2026-11-19T00:00Z', source: 'espn', sourceRef: '401841399' }],
      snapshotsDir,
      modulePath,
      fetchImpl: stubFetch({ failingEventIds: ['401841399'] }).fetchImpl,
      log: () => {},
      warn: (line) => warnings.push(line),
    })

    expect(outcome.captured).toBe(0)
    expect(warnings.join('\n')).toContain('::warning::ESPN falhou para o evento 401841399')
    expect(JSON.parse(readFileSync(join(snapshotsDir, 'espn-events-401841315.json'), 'utf8')).fetchedAt).toBe(
      'instante-anterior',
    )
  })

  it('não regride cobertura: módulo vigente maior que os snapshots é preservado', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    const moduleText = "export const SCORERS_SOURCE = {\n  matchesCovered: 5,\n} as const\n"
    writeFileSync(modulePath, moduleText)

    const warnings = []
    const outcome = await refreshEspnScorers({
      results: [RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl: stubFetch().fetchImpl,
      log: () => {},
      warn: (line) => warnings.push(line),
    })

    expect(outcome.written).toBe(false)
    expect(readFileSync(modulePath, 'utf8')).toBe(moduleText)
    expect(warnings.join('\n')).toContain('cobertura 1 < módulo vigente 5')
  })

  it('sem rede e sem índice local, falha em vez de fingir cobertura', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    await expect(
      refreshEspnScorers({
        results: [RESULT],
        snapshotsDir,
        modulePath,
        allowNetwork: false,
        log: () => {},
        warn: () => {},
      }),
    ).rejects.toThrow(/snapshot local ausente/)
  })

  it('--dry-run não escreve snapshot nem módulo', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    // Um snapshot anterior já existe; o dry-run lê, agrega e não grava nada.
    await refreshEspnScorers({
      results: [RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl: stubFetch().fetchImpl,
      log: () => {},
      warn: () => {},
    })
    const before = readdirSync(snapshotsDir).sort()
    const moduleBefore = readFileSync(modulePath, 'utf8')

    const outcome = await refreshEspnScorers({
      results: [RESULT],
      snapshotsDir,
      modulePath,
      fetchImpl: stubFetch().fetchImpl,
      write: false,
      log: () => {},
      warn: () => {},
    })

    expect(outcome.written).toBe(false)
    expect(outcome.captured).toBe(0)
    expect(outcome.coverage.matchesCovered).toBe(1)
    expect(readdirSync(snapshotsDir).sort()).toEqual(before)
    expect(readFileSync(modulePath, 'utf8')).toBe(moduleBefore)
  })

  it('recusa resposta de outro evento e não grava snapshot trocado', async () => {
    const { snapshotsDir, modulePath } = tempProject()
    const warnings = []
    const outcome = await refreshEspnScorers({
      results: [{ home: 'flamengo', away: 'coritiba', homeGoals: 1, awayGoals: 2, kickoff: '2026-11-19T00:00Z', source: 'espn', sourceRef: '401841399' }],
      snapshotsDir,
      modulePath,
      fetchImpl: stubFetch().fetchImpl,
      log: () => {},
      warn: (line) => warnings.push(line),
    })

    expect(outcome.captured).toBe(0)
    expect(warnings.join('\n')).toContain('::warning::ESPN falhou para o evento 401841399')
    expect(warnings.join('\n')).toContain('resposta do evento 401841315')
    expect(readdirSync(snapshotsDir).filter((file) => file.startsWith('espn-events-'))).toEqual([])
  })
})

describe('snapshotsSha', () => {
  it('é determinístico e independente da ordem dos snapshots', () => {
    const left = { eventId: '1', goals: [] }
    const right = { eventId: '2', goals: [] }
    expect(snapshotsSha([left, right])).toBe(snapshotsSha([right, left]))
    expect(snapshotsSha([left])).not.toBe(snapshotsSha([left, right]))
  })
})
