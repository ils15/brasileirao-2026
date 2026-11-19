import { ADVANCED_STATS_SOURCE } from './advancedStats2026'
import { captureRelation, formatUtcIso } from './seasonFacts'

/**
 * Captura e relação da fonte de xG/cartões (365scores).
 * Separado de `seasonFacts` para não puxar `advancedStats2026` (≈62 KB) para o
 * chunk inicial; apenas as abas que exibem a declaração da fonte o consomem.
 */
export const advancedStatsCaptureLabel = formatUtcIso(ADVANCED_STATS_SOURCE.fetchedAt)
export const advancedStatsCaptureRelation = captureRelation(ADVANCED_STATS_SOURCE.fetchedAt)
