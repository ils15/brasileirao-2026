import { describe, expect, it } from 'vitest'
import { runProjection } from './projection'
import { buildPointOutcomeCurve } from './pointCurve'
import {
  DEFAULT_LIBERTADORES_SCENARIO,
  LEGACY_LIBERTADORES_SCENARIO,
  LIBERTADORES_BASE_SLOTS,
  LIBERTADORES_MAX_LINE,
  SUDAMERICANA_SLOTS,
  resolveLibertadoresZones,
  scenarioFromKey,
  scenarioKeyOf,
  type LibertadoresScenario,
} from './projectionConfig'

function flags(
  copaDoBrasilCampeao: boolean,
  copaDoBrasilVice: boolean,
  libertadores: boolean,
  sudamericana: boolean,
): LibertadoresScenario {
  return {
    copaDoBrasilCampeaoDevolvido: copaDoBrasilCampeao,
    copaDoBrasilViceDevolvido: copaDoBrasilVice,
    libertadoresCampeaoDevolvido: libertadores,
    sudamericanaCampeaoDevolvido: sudamericana,
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/**
 * Tabela de referência do REC CBF 2026: 16 combinações de devolução, com a
 * divisão direto/preliminar. Só a linha não basta — G-6 com campeão da
 * Libertadores tem 1º–5º direto; G-6 com campeão da Copa do Brasil, 1º–4º.
 */
const REFERENCE_TABLE: readonly { scenario: LibertadoresScenario; directTo: number; line: number }[] = [
  { scenario: flags(false, false, false, false), directTo: 4, line: 5 },
  { scenario: flags(true, false, false, false), directTo: 4, line: 6 },
  { scenario: flags(false, true, false, false), directTo: 4, line: 6 },
  { scenario: flags(false, false, true, false), directTo: 5, line: 6 },
  { scenario: flags(false, false, false, true), directTo: 5, line: 6 },
  { scenario: flags(true, true, false, false), directTo: 4, line: 7 },
  { scenario: flags(true, false, true, false), directTo: 5, line: 7 },
  { scenario: flags(true, false, false, true), directTo: 5, line: 7 },
  { scenario: flags(false, true, true, false), directTo: 5, line: 7 },
  { scenario: flags(false, true, false, true), directTo: 5, line: 7 },
  { scenario: flags(false, false, true, true), directTo: 6, line: 7 },
  { scenario: flags(true, true, true, false), directTo: 5, line: 8 },
  { scenario: flags(true, true, false, true), directTo: 5, line: 8 },
  { scenario: flags(true, false, true, true), directTo: 6, line: 8 },
  { scenario: flags(false, true, true, true), directTo: 6, line: 8 },
  { scenario: flags(true, true, true, true), directTo: 6, line: 9 },
]

describe('cenários de vagas da Libertadores', () => {
  it('resolve as 16 combinações de devolução com a divisão direto/preliminar da tabela', () => {
    const keys = new Set<number>()
    for (const { scenario, directTo, line } of REFERENCE_TABLE) {
      expect(resolveLibertadoresZones(scenario)).toMatchObject({ directTo, libertadoresTo: line })
      keys.add(scenarioKeyOf(scenario))
    }
    expect(keys.size).toBe(16)
    expect(Math.max(...REFERENCE_TABLE.map(({ line }) => line))).toBe(LIBERTADORES_MAX_LINE)
  })

  it('mantém a Sul-Americana em [linha + 1, linha + 6] em todas as combinações', () => {
    for (let key = 0; key < 16; key += 1) {
      const zones = resolveLibertadoresZones(scenarioFromKey(key))
      expect(zones.libertadoresTo).toBeGreaterThanOrEqual(LIBERTADORES_BASE_SLOTS.direct + LIBERTADORES_BASE_SLOTS.preliminary)
      expect(zones.libertadoresTo).toBeLessThanOrEqual(LIBERTADORES_MAX_LINE)
      expect(zones.directTo).toBeLessThanOrEqual(zones.libertadoresTo)
      expect(zones.sudamericanaFrom).toBe(zones.libertadoresTo + 1)
      expect(zones.sudamericanaTo).toBe(zones.libertadoresTo + SUDAMERICANA_SLOTS)
    }
  })

  it('fixa a ordem canônica do bitmask e faz round-trip nas 16 chaves', () => {
    expect(scenarioKeyOf(DEFAULT_LIBERTADORES_SCENARIO)).toBe(0)
    expect(scenarioKeyOf(LEGACY_LIBERTADORES_SCENARIO)).toBe(1)
    const keys = Array.from({ length: 16 }, (_, key) => scenarioKeyOf(scenarioFromKey(key)))
    expect(new Set(keys).size).toBe(16)
    for (let key = 0; key < 16; key += 1) expect(scenarioKeyOf(scenarioFromKey(key))).toBe(key)
  })

  it('acompanha a sequência real do campeonato até o teto G-9', () => {
    const steps = [
      { scenario: flags(false, false, false, false), directTo: 4, line: 5, from: 6, to: 11 },
      { scenario: flags(true, false, false, false), directTo: 4, line: 6, from: 7, to: 12 },
      { scenario: flags(true, false, true, false), directTo: 5, line: 7, from: 8, to: 13 },
      { scenario: flags(true, false, true, true), directTo: 6, line: 8, from: 9, to: 14 },
      { scenario: flags(true, true, true, true), directTo: 6, line: 9, from: 10, to: 15 },
    ]
    for (const step of steps) {
      expect(resolveLibertadoresZones(step.scenario)).toEqual({
        directTo: step.directTo,
        libertadoresTo: step.line,
        sudamericanaFrom: step.from,
        sudamericanaTo: step.to,
      })
    }
  })

  it('limita a linha ao teto G-9 e rejeita chaves fora de 0–15', () => {
    const zones = resolveLibertadoresZones(scenarioFromKey(15))
    expect(zones.libertadoresTo).toBe(LIBERTADORES_MAX_LINE)
    expect(() => scenarioFromKey(16)).toThrow('Chave de cenário inválida')
    expect(() => scenarioFromKey(-1)).toThrow('Chave de cenário inválida')
  })

  it('aplica a linha resolvida à curva de pontos, não o ZONES fixo', () => {
    const curve = buildPointOutcomeCurve(
      [
        { simulation: 0, club: 'A', points: 50, position: 5 },
        { simulation: 1, club: 'B', points: 50, position: 6 },
      ],
      2,
      resolveLibertadoresZones(scenarioFromKey(0)),
    )
    expect(curve.rows.map(({ outcome }) => outcome)).toEqual(['libertadores', 'sudamericana'])
    expect(curve.inclusiveLibertadores[0]!.successes).toBe(1)
  })

  it('projeta as cinco linhas com as somas de probabilidade esperadas', { timeout: 60_000 }, () => {
    const steps = [
      { scenario: flags(false, false, false, false), line: 5, directTo: 4 },
      { scenario: flags(true, false, false, false), line: 6, directTo: 4 },
      { scenario: flags(true, false, true, false), line: 7, directTo: 5 },
      { scenario: flags(true, false, true, true), line: 8, directTo: 6 },
      { scenario: flags(true, true, true, true), line: 9, directTo: 6 },
    ]
    for (const { scenario, line, directTo } of steps) {
      const result = runProjection({ simulations: 200, seed: 20_261_104, scenario })
      expect(result.scenario).toEqual(scenario)
      expect(result.libertadoresZones).toEqual(resolveLibertadoresZones(scenario))
      expect(sum(result.clubProbabilities.map((club) => club.libertadores))).toBeCloseTo(line, 10)
      expect(sum(result.clubProbabilities.map((club) => club.libertadoresDirect))).toBeCloseTo(directTo, 10)
      expect(sum(result.clubProbabilities.map((club) => club.sudamericana))).toBeCloseTo(SUDAMERICANA_SLOTS, 10)
      expect(sum(result.clubProbabilities.map((club) => club.relegation))).toBeCloseTo(4, 10)
    }
  })

  it('acumula as 16 combinações por clube e alimenta o topo pelo cenário ativo', { timeout: 60_000 }, () => {
    const simulations = 200
    const result = runProjection({ simulations, seed: 777, scenario: LEGACY_LIBERTADORES_SCENARIO })
    const activeKey = scenarioKeyOf(LEGACY_LIBERTADORES_SCENARIO)
    const keys = Array.from({ length: 16 }, (_, key) => key)
    for (const club of result.clubProbabilities) {
      expect(club.lineCounts).toHaveLength(16)
      expect(club.lineCounts.map(({ scenarioKey }) => scenarioKey)).toEqual(keys)
      const active = club.lineCounts[activeKey]!
      expect(club.libertadores).toBe(active.libertadores / simulations)
      expect(club.libertadoresDirect).toBe(active.direct / simulations)
      expect(club.libertadoresInterval.probability).toBe(club.libertadores)
      expect(club.libertadoresDirectInterval.probability).toBe(club.libertadoresDirect)
    }
    for (const key of keys) {
      const zones = resolveLibertadoresZones(scenarioFromKey(key))
      const entries = result.clubProbabilities.map((club) => club.lineCounts[key]!)
      expect(sum(entries.map(({ libertadores }) => libertadores))).toBe(simulations * zones.libertadoresTo)
      expect(sum(entries.map(({ direct }) => direct))).toBe(simulations * zones.directTo)
    }
  })

  it('preserva a linha G-6 quando nenhum cenário é informado', { timeout: 60_000 }, () => {
    const result = runProjection({ simulations: 40, seed: 99 })
    expect(result.scenario).toEqual(LEGACY_LIBERTADORES_SCENARIO)
    expect(result.libertadoresZones).toEqual({
      directTo: 4,
      libertadoresTo: 6,
      sudamericanaFrom: 7,
      sudamericanaTo: 12,
    })
  })
})
