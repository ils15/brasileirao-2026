export interface Standing {
  position: number
  club: string
  points: number
  played: number
  initials: string
}

export interface Scorer {
  position: string
  name: string
  club: string
  goals: number
}

export const standings: Standing[] = currentClubs.map((club) => ({
  position: club.position,
  club: club.club,
  points: club.points,
  played: club.played,
  initials: club.initials,
}))

import { isPositionInZone, ZONES, type LibertadoresZones } from './projectionConfig'
import { currentClubs } from './projectionData'
import { SCORERS_SOURCE, scorers2026 } from './scorers2026'

export { SCORERS_SOURCE }

// Artilharia derivada do módulo GERADO (eventos de partida da ESPN): a lista literal
// manual (fonte ESPN sem metadados) foi substituída pela coleta automática
// pós-rodada. Posições empatadas compartilham o número do primeiro lugar.
const scorerClubNames = new Map(currentClubs.map(({ id, club }) => [id, club]))
let lastGoals = -1
let lastRank = 0
export const scorers: Scorer[] = scorers2026.map((scorer, index) => {
  const rank = scorer.goals === lastGoals ? lastRank : index + 1
  lastGoals = scorer.goals
  lastRank = rank
  return {
    position: `${rank}º`,
    name: scorer.name,
    club: scorerClubNames.get(scorer.club) ?? scorer.club,
    goals: scorer.goals,
  }
})

export type ClubFilter = 'all' | 'libertadores' | 'sudamericana' | 'sem-internacional' | 'relegation'

// Filtros legados: sem cenário explícito, usam a linha G-6 histórica. As
// labels das tabelas recebem as zonas ativas por `getZoneLabel`.
export function matchesClubFilter(position: number, filter: ClubFilter): boolean {
  if (filter === 'libertadores') return isPositionInZone(position, ZONES.libertadores)
  if (filter === 'sudamericana') return isPositionInZone(position, ZONES.sudamericana)
  if (filter === 'sem-internacional') return isPositionInZone(position, ZONES.middle)
  if (filter === 'relegation') return position >= ZONES.relegation.from
  return true
}

export interface ZoneLabels {
  label: string
  range: string
  detail: string
}

export type ZoneLabelSet = Record<'libertadores' | 'sudamericana' | 'middle' | 'relegation', ZoneLabels>

/** Faixa formatada em pt-BR; uma posição só não vira intervalo ("16º", não "16º–16º"). */
function positionRange(from: number, to: number): string {
  return from === to ? `${from}º` : `${from}º–${to}º`
}

/**
 * Rótulos derivados das fronteiras ativas do cenário. A linha da Libertadores
 * e a Sul-Americana deslizam juntas (a Sul-Americana ocupa sempre as seis
 * posições seguintes) e o meio de tabela é o que sobra até o rebaixamento fixo
 * em 17º–20º. Nenhum texto fica preso ao G-6.
 */
export function zoneLabelsFor(zones: LibertadoresZones): ZoneLabelSet {
  const libertadoresRange = positionRange(1, zones.libertadoresTo)
  const directRange = positionRange(1, zones.directTo)
  const preliminaryRange = positionRange(zones.directTo + 1, zones.libertadoresTo)
  const sudamericanaRange = positionRange(zones.sudamericanaFrom, zones.sudamericanaTo)
  return {
    libertadores: {
      label: ZONES.libertadores.label,
      range: libertadoresRange,
      detail: `${libertadoresRange} (${directRange} direto; ${preliminaryRange} na pré)`,
    },
    sudamericana: { label: ZONES.sudamericana.label, range: sudamericanaRange, detail: sudamericanaRange },
    middle: {
      label: ZONES.middle.label,
      range: positionRange(zones.sudamericanaTo + 1, ZONES.relegation.from - 1),
      detail: positionRange(zones.sudamericanaTo + 1, ZONES.relegation.from - 1),
    },
    relegation: {
      label: ZONES.relegation.label,
      range: positionRange(ZONES.relegation.from, ZONES.relegation.to),
      detail: positionRange(ZONES.relegation.from, ZONES.relegation.to),
    },
  }
}

/**
 * Zona da posição para o nome acessível da linha. Sem `zones`, mantém o
 * cenário G-6 histórico (com o asterisco) usado antes do seletor.
 */
export function getZoneLabel(position: number, zones?: LibertadoresZones): string {
  if (zones) {
    const labels = zoneLabelsFor(zones)
    if (position <= zones.libertadoresTo) return `${labels.libertadores.label} · ${labels.libertadores.range}`
    if (position <= zones.sudamericanaTo) return `${labels.sudamericana.label} · ${labels.sudamericana.range}`
    if (position >= ZONES.relegation.from) return `${labels.relegation.label} · ${labels.relegation.range}`
    return `${labels.middle.label} · ${labels.middle.range}`
  }
  if (matchesClubFilter(position, 'libertadores')) return `${ZONES.libertadores.label} · ${ZONES.libertadores.detail.split(' (')[0]}`
  if (matchesClubFilter(position, 'sudamericana')) return `${ZONES.sudamericana.label} · ${ZONES.sudamericana.detail}`
  if (matchesClubFilter(position, 'sem-internacional')) return `${ZONES.middle.label} · ${ZONES.middle.detail}`
  return `${ZONES.relegation.label} · ${ZONES.relegation.detail}`
}
