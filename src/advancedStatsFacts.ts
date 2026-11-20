import { ADVANCED_STATS_SOURCE } from './advancedStats2026'
import { captureRelation, formatUtcIso } from './seasonFacts'

/**
 * Captura e relação da fonte de xG/cartões (365scores).
 * Separado de `seasonFacts` para não puxar `advancedStats2026` (≈62 KB) para o
 * chunk inicial; apenas as abas que exibem a declaração da fonte o consomem.
 */

export type AdvancedCoverageStatus = 'complete' | 'partial' | 'stale'

export interface AdvancedCoverage {
  matches: number
  expected: number
  missing: readonly string[]
  ratio: number
  status: AdvancedCoverageStatus
}

/** Cobertura declarada pelo módulo gerado; o payload não é importado aqui além do SOURCE. */
export function advancedCoverage(): AdvancedCoverage {
  const { missing } = ADVANCED_STATS_SOURCE.coverage
  // O módulo é `as const`; tipar como number evita comparações narrow que o
  // TypeScript marcaria como sem sobreposição quando a cobertura for parcial.
  const matches: number = ADVANCED_STATS_SOURCE.coverage.matches
  const expected: number = ADVANCED_STATS_SOURCE.coverage.expected
  return {
    matches,
    expected,
    missing,
    ratio: expected > 0 ? matches / expected : 0,
    status: matches === 0 ? 'stale' : matches === expected ? 'complete' : 'partial',
  }
}

/** `"339/347 partidas"` — sempre derivado de `coverage`, nunca de literal de UI. */
export function advancedCoverageLabel(): string {
  const { matches, expected } = advancedCoverage()
  return `${matches}/${expected} partidas`
}

/** Data de captura em pt-BR, derivada de `fetchedAt`. */
export function advancedCaptureLabel(): string {
  return formatUtcIso(ADVANCED_STATS_SOURCE.fetchedAt)
}

/** Rótulo de status; `partial` nunca é apresentado como completo. */
export function advancedCoverageStatusLabel(): string {
  const { status } = advancedCoverage()
  if (status === 'complete') return 'cobertura completa'
  if (status === 'partial') return 'cobertura parcial'
  return 'sem registros na fonte'
}

/** Linha única usada por Auditoria e Metodologia. */
export function advancedCoverageSummary(): string {
  return `Cobertura xG/cartões: ${advancedCoverageLabel()} · captura ${advancedCaptureLabel()} · ${advancedCoverageStatusLabel()}`
}

export const advancedStatsCaptureLabel = advancedCaptureLabel()
export const advancedStatsCaptureRelation = captureRelation(ADVANCED_STATS_SOURCE.fetchedAt)
