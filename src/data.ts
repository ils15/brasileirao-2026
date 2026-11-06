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

export const scorers: Scorer[] = [
  { position: '1º', name: 'Kevin Viveros', club: 'Athletico Paranaense', goals: 21 },
  { position: '2º', name: 'Pedro', club: 'Flamengo', goals: 18 },
  { position: '3º', name: 'Gabriel Barbosa', club: 'Santos', goals: 15 },
  { position: '4º', name: 'Kaio Jorge', club: 'Cruzeiro', goals: 13 },
  { position: '5º', name: 'Samuel Lino', club: 'Flamengo', goals: 11 },
  { position: '5º', name: 'Luciano Juba', club: 'Bahia', goals: 11 },
  { position: '5º', name: 'Vinicius', club: 'Grêmio', goals: 11 },
]

import { ZONES } from './projectionConfig'
import { currentClubs } from './projectionData'

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
