import { historicalSeasons } from './historicalSeasons'

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
  { id: 'flamengo', club: 'Flamengo', initials: 'FLA', position: 1, points: 73, played: 33, wins: 22, draws: 7, losses: 4, goalsFor: 68, goalsAgainst: 28 },
  { id: 'palmeiras', club: 'Palmeiras', initials: 'PAL', position: 2, points: 70, played: 33, wins: 20, draws: 10, losses: 3, goalsFor: 56, goalsAgainst: 22 },
  { id: 'cruzeiro', club: 'Cruzeiro', initials: 'CRU', position: 3, points: 57, played: 33, wins: 17, draws: 6, losses: 10, goalsFor: 52, goalsAgainst: 46 },
  { id: 'fluminense', club: 'Fluminense', initials: 'FLU', position: 4, points: 54, played: 33, wins: 15, draws: 9, losses: 9, goalsFor: 52, goalsAgainst: 42 },
  { id: 'athletico-pr', club: 'Athletico Paranaense', initials: 'CAP', position: 5, points: 54, played: 33, wins: 15, draws: 9, losses: 9, goalsFor: 50, goalsAgainst: 40 },
  { id: 'bahia', club: 'Bahia', initials: 'BAH', position: 6, points: 53, played: 33, wins: 14, draws: 11, losses: 8, goalsFor: 48, goalsAgainst: 42 },
  { id: 'atletico-mg', club: 'Atlético Mineiro', initials: 'CAM', position: 7, points: 50, played: 33, wins: 14, draws: 8, losses: 11, goalsFor: 44, goalsAgainst: 39 },
  { id: 'bragantino', club: 'Red Bull Bragantino', initials: 'RBB', position: 8, points: 47, played: 34, wins: 13, draws: 8, losses: 13, goalsFor: 44, goalsAgainst: 39 },
  { id: 'santos', club: 'Santos FC', initials: 'SAN', position: 9, points: 47, played: 34, wins: 12, draws: 11, losses: 11, goalsFor: 50, goalsAgainst: 49 },
  { id: 'sao-paulo', club: 'São Paulo', initials: 'SAO', position: 10, points: 43, played: 33, wins: 12, draws: 7, losses: 14, goalsFor: 39, goalsAgainst: 39 },
  { id: 'coritiba', club: 'Coritiba SAF', initials: 'CFC', position: 11, points: 42, played: 34, wins: 11, draws: 9, losses: 14, goalsFor: 40, goalsAgainst: 51 },
  { id: 'mirassol', club: 'Mirassol', initials: 'MIR', position: 12, points: 40, played: 34, wins: 10, draws: 10, losses: 14, goalsFor: 39, goalsAgainst: 48 },
  { id: 'botafogo', club: 'Botafogo', initials: 'BOT', position: 13, points: 39, played: 33, wins: 10, draws: 9, losses: 14, goalsFor: 45, goalsAgainst: 53 },
  { id: 'vasco', club: 'Vasco da Gama SAF', initials: 'VAS', position: 14, points: 38, played: 32, wins: 10, draws: 8, losses: 14, goalsFor: 40, goalsAgainst: 49 },
  { id: 'vitoria', club: 'Vitória', initials: 'VIT', position: 15, points: 38, played: 33, wins: 10, draws: 8, losses: 15, goalsFor: 35, goalsAgainst: 48 },
  { id: 'internacional', club: 'Internacional', initials: 'INT', position: 16, points: 38, played: 34, wins: 9, draws: 11, losses: 14, goalsFor: 38, goalsAgainst: 42 },
  { id: 'gremio', club: 'Grêmio', initials: 'GRE', position: 17, points: 37, played: 33, wins: 9, draws: 10, losses: 14, goalsFor: 37, goalsAgainst: 44 },
  { id: 'corinthians', club: 'Corinthians', initials: 'COR', position: 18, points: 36, played: 33, wins: 9, draws: 9, losses: 15, goalsFor: 36, goalsAgainst: 42 },
  { id: 'remo', club: 'Remo', initials: 'REM', position: 19, points: 29, played: 33, wins: 6, draws: 11, losses: 16, goalsFor: 36, goalsAgainst: 51 },
  { id: 'chapecoense', club: 'Chapecoense', initials: 'CHA', position: 20, points: 21, played: 33, wins: 4, draws: 9, losses: 20, goalsFor: 33, goalsAgainst: 68 },
]

export const remainingFixtures: RemainingFixture[] = [
  { round: '35', home: 'flamengo', away: 'athletico-pr', cbfRef: '341' },
  { round: '35', home: 'vasco', away: 'internacional', cbfRef: '342' },
  { round: '35', home: 'sao-paulo', away: 'fluminense', cbfRef: '343' },
  { round: '35', home: 'corinthians', away: 'botafogo', cbfRef: '344' },
  { round: '35', home: 'mirassol', away: 'atletico-mg', cbfRef: '345' },
  { round: '35', home: 'cruzeiro', away: 'palmeiras', cbfRef: '346' },
  { round: '35', home: 'gremio', away: 'bahia', cbfRef: '347' },
  { round: '35', home: 'coritiba', away: 'santos', cbfRef: '348' },
  { round: '35', home: 'vitoria', away: 'bragantino', cbfRef: '349' },
  { round: '35', home: 'remo', away: 'chapecoense', cbfRef: '350' },
  { round: '36', home: 'fluminense', away: 'mirassol', cbfRef: '351' },
  { round: '36', home: 'botafogo', away: 'sao-paulo', cbfRef: '352' },
  { round: '36', home: 'santos', away: 'gremio', cbfRef: '353' },
  { round: '36', home: 'palmeiras', away: 'flamengo', cbfRef: '354' },
  { round: '36', home: 'bragantino', away: 'vasco', cbfRef: '355' },
  { round: '36', home: 'atletico-mg', away: 'corinthians', cbfRef: '356' },
  { round: '36', home: 'internacional', away: 'vitoria', cbfRef: '357' },
  { round: '36', home: 'athletico-pr', away: 'remo', cbfRef: '358' },
  { round: '36', home: 'bahia', away: 'coritiba', cbfRef: '359' },
  { round: '36', home: 'chapecoense', away: 'cruzeiro', cbfRef: '360' },
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
  { round: '21 adiado', home: 'chapecoense', away: 'vasco', cbfRef: '210' },
  { round: '34 adiado', home: 'flamengo', away: 'gremio', cbfRef: '331' },
  { round: '34 adiado', home: 'botafogo', away: 'atletico-mg', cbfRef: '332' },
  { round: '34 adiado', home: 'sao-paulo', away: 'corinthians', cbfRef: '333' },
  { round: '34 adiado', home: 'palmeiras', away: 'remo', cbfRef: '334' },
  { round: '34 adiado', home: 'cruzeiro', away: 'bahia', cbfRef: '336' },
  { round: '34 adiado', home: 'athletico-pr', away: 'vasco', cbfRef: '338' },
  { round: '34 adiado', home: 'vitoria', away: 'fluminense', cbfRef: '339' },
]

export { historicalSeasons }
