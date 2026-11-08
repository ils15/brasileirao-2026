import { currentSeasonResults, CURRENT_SEASON_SOURCE } from './currentSeasonResults'
import { SCORERS_SOURCE } from './scorers2026'
import { currentClubs, remainingFixtures, historicalSeasons } from './projectionData'
import { cbfOfficialSchedule } from './cbfOfficialSchedule'
import { filterAtOrBeforeAnalyticalCutoff, ANALYTICAL_CUTOFF_LOCAL, ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'

/**
 * Fatos voláteis da temporada derivados dos módulos de dados. Toda a UI lê
 * estes valores em vez de literais (contagens, datas), para que a
 * atualização automática pós-rodada não deixe números defasados nas telas.
 */

/** Horário local declarado, sem converter nem ocultar o fuso de origem. */
function formatLocalIso(iso: string): string {
  const [date, rest] = iso.split('T')
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year} · ${rest.slice(0, 8)}`
}

/** Timestamp ISO UTC de captura, preservando segundos e seu fuso explícito. */
function formatUtcIso(iso: string): string {
  const [date, time] = iso.replace(/Z$/, '').split('T')
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year} · ${time.slice(0, 8)} UTC`
}

const playedMatches = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults)

const roundByPair = new Map(cbfOfficialSchedule.map(([, round, home, away]) => [`${home}:${away}`, round]))

export const seasonFacts = {
  clubsCount: currentClubs.length,
  playedCount: playedMatches.length,
  remainingCount: remainingFixtures.length,
  scheduledCount: cbfOfficialSchedule.length,
  /** Maior rodada com jogo disputado (adiados podem deixar rodadas futuras com jogos a menos). */
  lastPlayedRound: Math.max(0, ...playedMatches.map((match) => roundByPair.get(`${match.home}:${match.away}`) ?? 0)),
  cutoffLocal: ANALYTICAL_CUTOFF_LOCAL,
  cutoffUtc: ANALYTICAL_CUTOFF_UTC,
} as const

/** Histórico empacotado (regenerável por scripts/pack-history.mjs). */
export const historicalFacts = {
  seasons: historicalSeasons.length,
  firstYear: Math.min(...historicalSeasons.map((season) => season.year)),
  lastYear: Math.max(...historicalSeasons.map((season) => season.year)),
  totalMatches: historicalSeasons.reduce((sum, season) => sum + season.matches.length, 0),
  verifiedRange: '2021–2025',
} as const

/** Rótulo legível do corte analítico (horário local de Brasília declarado). */
export const cutoffLabel = `${formatLocalIso(ANALYTICAL_CUTOFF_LOCAL)} BRT`

/** Resumo do corte analítico, distinto da captura e da geração do pacote. */
export const cutoffSummaryLine = (() => {
  return `Resultados e análises até ${cutoffLabel} · nova verificação automática a cada 2 horas`
})()

/** Captura da fonte de artilharia; não implica cobertura por partida até esse horário. */
export const scorersCaptureLabel = formatUtcIso(SCORERS_SOURCE.fetchedAt)

/** Relógio de atualização: quando os dados foram cortados e quando o site se atualiza de novo. */
export const updateClock = {
  /** Corte analítico como Date (BRT declarado). */
  cutoffDate: new Date(ANALYTICAL_CUTOFF_LOCAL),
  /** Última coleta declarada pelas fontes. */
  lastCollected: CURRENT_SEASON_SOURCE.footballData.collectedAt,
  /** Dias entre o corte e hoje (0 quando o corte é de hoje ou ainda não chegou). */
  get daysSinceCutoff(): number {
    return Math.max(0, Math.floor((Date.now() - this.cutoffDate.getTime()) / 86_400_000))
  },
  /** Verdadeiro quando há coleta automática agendada para as próximas horas. */
  get nextRunToday(): boolean {
    return this.daysSinceCutoff <= 1
  },
} as const
