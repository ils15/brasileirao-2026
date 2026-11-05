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

export const standings: Standing[] = [
  { position: 1, club: 'Flamengo', points: 73, played: 33, initials: 'FLA' },
  { position: 2, club: 'Palmeiras', points: 70, played: 33, initials: 'PAL' },
  { position: 3, club: 'Cruzeiro', points: 57, played: 33, initials: 'CRU' },
  { position: 4, club: 'Fluminense', points: 54, played: 33, initials: 'FLU' },
  { position: 5, club: 'Athletico Paranaense', points: 54, played: 33, initials: 'CAP' },
  { position: 6, club: 'Bahia', points: 53, played: 33, initials: 'BAH' },
  { position: 7, club: 'Atlético Mineiro', points: 50, played: 33, initials: 'CAM' },
  { position: 8, club: 'Red Bull Bragantino', points: 47, played: 34, initials: 'RBB' },
  { position: 9, club: 'Santos FC', points: 47, played: 34, initials: 'SAN' },
  { position: 10, club: 'São Paulo', points: 43, played: 33, initials: 'SAO' },
  { position: 11, club: 'Coritiba SAF', points: 42, played: 34, initials: 'CFC' },
  { position: 12, club: 'Mirassol', points: 40, played: 34, initials: 'MIR' },
  { position: 13, club: 'Botafogo', points: 39, played: 33, initials: 'BOT' },
  { position: 14, club: 'Vasco da Gama SAF', points: 38, played: 32, initials: 'VAS' },
  { position: 15, club: 'Vitória', points: 38, played: 33, initials: 'VIT' },
  { position: 16, club: 'Internacional', points: 38, played: 34, initials: 'INT' },
  { position: 17, club: 'Grêmio', points: 37, played: 33, initials: 'GRE' },
  { position: 18, club: 'Corinthians', points: 36, played: 33, initials: 'COR' },
  { position: 19, club: 'Remo', points: 29, played: 33, initials: 'REM' },
  { position: 20, club: 'Chapecoense', points: 21, played: 33, initials: 'CHA' },
]

export const scorers: Scorer[] = [
  { position: '1º', name: 'Kevin Viveros', club: 'Athletico Paranaense', goals: 21 },
  { position: '2º', name: 'Pedro', club: 'Flamengo', goals: 18 },
  { position: '3º', name: 'Gabriel Barbosa', club: 'Santos', goals: 15 },
  { position: '4º', name: 'Kaio Jorge', club: 'Cruzeiro', goals: 13 },
  { position: '5º', name: 'Samuel Lino', club: 'Flamengo', goals: 11 },
  { position: '5º', name: 'Luciano Juba', club: 'Bahia', goals: 11 },
  { position: '5º', name: 'Vinicius', club: 'Grêmio', goals: 11 },
]

export type ClubFilter = 'all' | 'qualification' | 'middle' | 'relegation'

export function matchesClubFilter(position: number, filter: ClubFilter): boolean {
  if (filter === 'qualification') return position <= 6
  if (filter === 'relegation') return position >= 17
  if (filter === 'middle') return position >= 7 && position <= 16
  return true
}

export function getZoneLabel(position: number): string {
  if (position <= 6) return 'Faixa de classificação'
  if (position >= 17) return 'Zona de rebaixamento'
  return 'Demais posições'
}
