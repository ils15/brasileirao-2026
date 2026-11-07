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

import { ZONES } from './projectionConfig'
import { currentClubs } from './projectionData'
import { SCORERS_SOURCE, scorers2026 } from './scorers2026'

export { SCORERS_SOURCE }

// Artilharia derivada do módulo GERADO (API Futebol BR): a lista literal
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

// Fronteiras vindas de projectionConfig.ZONES: a marcação de zona da
// classificação segue a mesma definição usada nas projeções (auditoria:
// a legenda antiga marcava 1º–6º como "classificação" enquanto a projeção
// colocava o 6º na Sul-Americana).
export function matchesClubFilter(position: number, filter: ClubFilter): boolean {
  if (filter === 'libertadores') return position >= ZONES.libertadores.from && position <= ZONES.libertadores.to
  if (filter === 'sudamericana') return position >= ZONES.sudamericana.from && position <= ZONES.sudamericana.to
  if (filter === 'sem-internacional') return position >= ZONES.middle.from && position <= ZONES.middle.to
  if (filter === 'relegation') return position >= ZONES.relegation.from
  return true
}

export function getZoneLabel(position: number): string {
  if (matchesClubFilter(position, 'libertadores')) return `${ZONES.libertadores.label} (${ZONES.libertadores.detail})`
  if (matchesClubFilter(position, 'relegation')) return `Zona de rebaixamento (${ZONES.relegation.detail})`
  return `${ZONES.sudamericana.label} ou meio de tabela (${ZONES.sudamericana.detail}–${ZONES.middle.detail})`
}
