import { historicalSeasons, modelableHistoricalSeasons } from './historicalSeasons'

/**
 * Histórico empacotado (regenerável por scripts/pack-history.mjs).
 * Fica fora de `seasonFacts` porque arrasta `historicalSeasons` (≈424 KB)
 * para o chunk inicial — só a aba Metodologia & Auditoria consome estes fatos.
 */
export const historicalFacts = {
  seasons: historicalSeasons.length,
  firstYear: Math.min(...historicalSeasons.map((season) => season.year)),
  lastYear: Math.max(...historicalSeasons.map((season) => season.year)),
  totalMatches: historicalSeasons.reduce((sum, season) => sum + season.matches.length, 0),
  modelableSeasons: modelableHistoricalSeasons.length,
  modelableFirstYear: Math.min(...modelableHistoricalSeasons.map((season) => season.year)),
  modelableLastYear: Math.max(...modelableHistoricalSeasons.map((season) => season.year)),
  modelableMatches: modelableHistoricalSeasons.reduce((sum, season) => sum + season.matches.length, 0),
  verifiedRange: '2021–2025',
} as const
