// Empacotado automaticamente por scripts/update-data.mjs; agregado reconciliado com os resultados.
export interface ProjectionClub {
  id: string
  club: string
  initials: string
  position: number
  points: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

export interface RemainingFixture {
  round: string
  home: string
  away: string
  cbfRef: string
}

export const currentClubs: ProjectionClub[] = [
  { id: 'flamengo', club: 'Flamengo', initials: 'FLA', position: 1, points: 80, played: 36, wins: 24, draws: 8, losses: 4, goalsFor: 74, goalsAgainst: 31 },
  { id: 'palmeiras', club: 'Palmeiras', initials: 'PAL', position: 2, points: 74, played: 36, wins: 21, draws: 11, losses: 4, goalsFor: 64, goalsAgainst: 26 },
  { id: 'cruzeiro', club: 'Cruzeiro', initials: 'CRU', position: 3, points: 66, played: 36, wins: 20, draws: 6, losses: 10, goalsFor: 59, goalsAgainst: 50 },
  { id: 'fluminense', club: 'Fluminense', initials: 'FLU', position: 4, points: 63, played: 36, wins: 18, draws: 9, losses: 9, goalsFor: 57, goalsAgainst: 42 },
  { id: 'athletico-pr', club: 'Athletico Paranaense', initials: 'CAP', position: 5, points: 57, played: 36, wins: 16, draws: 9, losses: 11, goalsFor: 56, goalsAgainst: 47 },
  { id: 'bahia', club: 'Bahia', initials: 'BAH', position: 6, points: 54, played: 36, wins: 14, draws: 12, losses: 10, goalsFor: 50, goalsAgainst: 46 },
  { id: 'atletico-mg', club: 'Atlético Mineiro', initials: 'CAM', position: 7, points: 51, played: 35, wins: 14, draws: 9, losses: 12, goalsFor: 44, goalsAgainst: 40 },
  { id: 'bragantino', club: 'Red Bull Bragantino', initials: 'RBB', position: 8, points: 50, played: 36, wins: 14, draws: 8, losses: 14, goalsFor: 46, goalsAgainst: 41 },
  { id: 'santos', club: 'Santos FC', initials: 'SAN', position: 9, points: 50, played: 36, wins: 13, draws: 11, losses: 12, goalsFor: 51, goalsAgainst: 51 },
  { id: 'vasco', club: 'Vasco da Gama SAF', initials: 'VAS', position: 10, points: 47, played: 36, wins: 13, draws: 8, losses: 15, goalsFor: 47, goalsAgainst: 52 },
  { id: 'sao-paulo', club: 'São Paulo', initials: 'SAO', position: 11, points: 45, played: 36, wins: 12, draws: 9, losses: 15, goalsFor: 40, goalsAgainst: 41 },
  { id: 'coritiba', club: 'Coritiba SAF', initials: 'CFC', position: 12, points: 45, played: 36, wins: 12, draws: 9, losses: 15, goalsFor: 41, goalsAgainst: 52 },
  { id: 'vitoria', club: 'Vitória', initials: 'VIT', position: 13, points: 44, played: 36, wins: 12, draws: 8, losses: 16, goalsFor: 42, goalsAgainst: 54 },
  { id: 'botafogo', club: 'Botafogo', initials: 'BOT', position: 14, points: 43, played: 36, wins: 11, draws: 10, losses: 15, goalsFor: 47, goalsAgainst: 58 },
  { id: 'gremio', club: 'Grêmio', initials: 'GRE', position: 15, points: 41, played: 36, wins: 10, draws: 11, losses: 15, goalsFor: 40, goalsAgainst: 47 },
  { id: 'mirassol', club: 'Mirassol', initials: 'MIR', position: 16, points: 41, played: 36, wins: 10, draws: 11, losses: 15, goalsFor: 39, goalsAgainst: 49 },
  { id: 'corinthians', club: 'Corinthians', initials: 'COR', position: 17, points: 40, played: 35, wins: 10, draws: 10, losses: 15, goalsFor: 40, goalsAgainst: 42 },
  { id: 'internacional', club: 'Internacional', initials: 'INT', position: 18, points: 38, played: 36, wins: 9, draws: 11, losses: 16, goalsFor: 41, goalsAgainst: 49 },
  { id: 'remo', club: 'Remo', initials: 'REM', position: 19, points: 32, played: 36, wins: 7, draws: 11, losses: 18, goalsFor: 41, goalsAgainst: 61 },
  { id: 'chapecoense', club: 'Chapecoense', initials: 'CHA', position: 20, points: 21, played: 36, wins: 4, draws: 9, losses: 23, goalsFor: 34, goalsAgainst: 74 },
]

export const remainingFixtures: RemainingFixture[] = [
  { round: '36', home: 'atletico-mg', away: 'corinthians', cbfRef: '356' },
  { round: '37', home: 'fluminense', away: 'cruzeiro', cbfRef: '361' },
  { round: '37', home: 'botafogo', away: 'bahia', cbfRef: '362' },
  { round: '37', home: 'sao-paulo', away: 'remo', cbfRef: '363' },
  { round: '37', home: 'corinthians', away: 'gremio', cbfRef: '364' },
  { round: '37', home: 'mirassol', away: 'athletico-pr', cbfRef: '365' },
  { round: '37', home: 'atletico-mg', away: 'vasco', cbfRef: '366' },
  { round: '37', home: 'internacional', away: 'bragantino', cbfRef: '367' },
  { round: '37', home: 'coritiba', away: 'flamengo', cbfRef: '368' },
  { round: '37', home: 'vitoria', away: 'santos', cbfRef: '369' },
  { round: '37', home: 'chapecoense', away: 'palmeiras', cbfRef: '370' },
  { round: '38', home: 'flamengo', away: 'chapecoense', cbfRef: '371' },
  { round: '38', home: 'vasco', away: 'vitoria', cbfRef: '372' },
  { round: '38', home: 'santos', away: 'botafogo', cbfRef: '373' },
  { round: '38', home: 'palmeiras', away: 'coritiba', cbfRef: '374' },
  { round: '38', home: 'bragantino', away: 'fluminense', cbfRef: '375' },
  { round: '38', home: 'cruzeiro', away: 'internacional', cbfRef: '376' },
  { round: '38', home: 'gremio', away: 'mirassol', cbfRef: '377' },
  { round: '38', home: 'athletico-pr', away: 'sao-paulo', cbfRef: '378' },
  { round: '38', home: 'bahia', away: 'atletico-mg', cbfRef: '379' },
  { round: '38', home: 'remo', away: 'corinthians', cbfRef: '380' },
]

export { historicalSeasons } from './historicalSeasons'

/**
 * IDs ESPN dos 20 clubes — base dos escudos oficiais em
 * https://a.espncdn.com/i/teamlogos/soccer/500/{id}.png (CDN pública ESPN).
 */
export const ESPN_TEAM_IDS: Readonly<Record<string, number>> = {"flamengo":819,"palmeiras":2029,"cruzeiro":2022,"fluminense":3445,"athletico-pr":3458,"bahia":9967,"atletico-mg":7632,"bragantino":6079,"santos":2674,"sao-paulo":2026,"botafogo":6086,"coritiba":3456,"vasco":3454,"mirassol":9169,"vitoria":3457,"internacional":1936,"corinthians":874,"gremio":6273,"remo":4936,"chapecoense":9318}

export function espnLogoUrl(clubId: string): string | undefined {
  const id = ESPN_TEAM_IDS[clubId]
  return id ? 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png' : undefined
}

/** Escudo pelo nome de exibição (usado onde não há slug, ex. standings da Visão Geral). */
export function espnLogoUrlByClub(clubName: string): string | undefined {
  const club = currentClubs.find((entry) => entry.club === clubName)
  return club ? espnLogoUrl(club.id) : undefined
}
