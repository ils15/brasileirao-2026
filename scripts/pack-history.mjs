/**
 * Empacotador do histórico completo (2012–2025) a partir do CSV Football-Data.
 *
 * - teamIds por temporada em ordem alfabética de slug;
 * - kickoff 'YYYY-MM-DDTHH:mm' sem fuso (formato original do CSV) e ordinal
 *   1..N pela ordem cronológica;
 * - officialStandings apenas para as temporadas com validação independente
 *   (2021–2025, herdadas do empacotamento original); as anteriores ficam sem
 *   standings e marcadas como não verificadas — a validação agregada CBF não
 *   foi refeita para esses anos;
 * - o jogo Chapecoense × Atlético-MG de 11/12/2016 vai sem placar (partida não
 *   disputada após a tragédia com o voo LaMia; o CSV não registra resultado).
 *
 * Uso: node scripts/pack-history.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const TEAM_SLUGS = {
  'America MG': 'america-mg',
  'Athletico-PR': 'athletico-pr',
  'Atletico GO': 'atletico-go',
  'Atletico-MG': 'atletico-mg',
  'Avai': 'avai',
  'Bahia': 'bahia',
  'Botafogo RJ': 'botafogo',
  'Bragantino': 'bragantino',
  'CSA': 'csa',
  'Ceara': 'ceara',
  'Chapecoense-SC': 'chapecoense',
  'Corinthians': 'corinthians',
  'Coritiba': 'coritiba',
  'Criciuma': 'criciuma',
  'Cuiaba': 'cuiaba',
  'Cruzeiro': 'cruzeiro',
  'Figueirense': 'figueirense',
  'Flamengo RJ': 'flamengo',
  'Fluminense': 'fluminense',
  'Fortaleza': 'fortaleza',
  'Goias': 'goias',
  'Gremio': 'gremio',
  'Internacional': 'internacional',
  'Joinville': 'joinville',
  'Juventude': 'juventude',
  'Mirassol': 'mirassol',
  'Nautico': 'nautico',
  'Palmeiras': 'palmeiras',
  'Parana': 'parana',
  'Ponte Preta': 'ponte-preta',
  'Portuguesa': 'portuguesa',
  'Santa Cruz': 'santa-cruz',
  'Santos': 'santos',
  'Sao Paulo': 'saopaulo', // histórico 2012–2025 mantém o identificador original do pack
  'Sport Recife': 'sport',
  'Vasco': 'vasco',
  'Vitoria': 'vitoria',
}

const FIRST_YEAR = 2012
const LAST_YEAR = 2025
const VERIFIED_YEARS = new Set([2021, 2022, 2023, 2024, 2025])

function isoFromBr(date) {
  const [day, month, year] = date.split('/')
  return `${year}-${month}-${day}`
}

function slugOf(name) {
  const slug = TEAM_SLUGS[name]
  if (!slug) throw new Error(`Nome de clube sem slug: "${name}". Atualize TEAM_SLUGS.`)
  return slug
}

function loadVerifiedStandings() {
  const json = JSON.parse(readFileSync('/tmp/standings-2021-2025.json', 'utf8'))
  return new Map(Object.entries(json).map(([year, standings]) => [Number(year), standings]))
}

function main() {
  const csvText = readFileSync(join(root, 'data/source-snapshots/football-data-BR.csv'), 'utf8')
  const csvSha256 = createHash('sha256').update(csvText, 'utf8').digest('hex')
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const skipped = []
  const seasons = new Map()

  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(',')
    if (columns.length < 10 || columns[0] !== 'Brazil' || columns[1] !== 'Serie A') continue
    const year = Number(columns[2])
    if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) continue
    const played = columns[7] !== '' && columns[8] !== ''
    if (!played) {
      skipped.push({ year, date: columns[3], home: columns[5], away: columns[6] })
      continue
    }
    const season = seasons.get(year) ?? { year, matches: [] }
    const kickoffDate = isoFromBr(columns[3])
    const time = (columns[4] || '00:00').trim()
    season.matches.push({
      home: slugOf(columns[5]),
      away: slugOf(columns[6]),
      homeGoals: Number(columns[7]),
      awayGoals: Number(columns[8]),
      kickoff: `${kickoffDate}T${time}`,
      csvLine: index + 1,
    })
    seasons.set(year, season)
  }

  const verifiedStandings = loadVerifiedStandings()

  const seasonBlocks = []
  for (const year of [...seasons.keys()].sort((a, b) => a - b)) {
    const season = seasons.get(year)
    const teamIds = [...new Set(season.matches.flatMap(({ home, away }) => [home, away]))].sort((a, b) => a.localeCompare(b))
    const teamIndex = new Map(teamIds.map((id, index) => [id, index]))
    const ordered = [...season.matches]
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.csvLine - b.csvLine)
      .map((match, index) => ({ ...match, ordinal: index + 1 }))
    const standingsVerified = VERIFIED_YEARS.has(year)
    const standings = standingsVerified ? verifiedStandings.get(year) : null
    if (standingsVerified && (!standings || standings.length !== 20)) throw new Error(`Standings verificados ausentes para ${year}.`)

    const matchLines = ordered.map((match) =>
      `    [${teamIndex.get(match.home)}, ${teamIndex.get(match.away)}, ${match.homeGoals}, ${match.awayGoals}, '${match.kickoff}', ${match.ordinal}],`)
      .join('\n')

    let block = `  {
    year: ${year},
    teamIds: [${teamIds.map((id) => `'${id}'`).join(', ')}],
    matches: [
${matchLines}
    ],
`
    if (standings) {
      const standingLines = standings
        .map((row) => `      ['${row[0]}', ${row[1]}, ${row[2]}, ${row[3]}, ${row[4]}, ${row[5]}, ${row[6]}, ${row[7]}],`)
        .join('\n')
      block += `    officialStandings: [
${standingLines}
    ],
`
    }
    block += `    validation: { matches: ${ordered.length}, clubs: ${teamIds.length}, standingsVerified: ${standingsVerified} },
  },`
    seasonBlocks.push(block)
  }

  const skippedNote = skipped.length > 0
    ? `\n// Partidas registradas sem placar no CSV e não empacotadas: ${skipped.map(({ year, date, home, away }) => `${home} × ${away} (${date}, ${year})`).join('; ')}.`
    : ''

  const file = `// Placares empacotados do CSV Football-Data (temporadas ${FIRST_YEAR}–${LAST_YEAR}, ${seasonBlocks.reduce((sum, ) => 0, 0) + ''} ${seasonBlocks.length} temporadas); gerado por scripts/pack-history.mjs.
// Cada partida preserva kickoff e ordinal original por temporada; cortes usam kickoff, não a posição do array.
// Validação agregada contra tabelas finais CBF: somente 2021–2025 (standingsVerified); as temporadas anteriores não foram verificadas contra fonte independente.${skippedNote}
// SHA-256 do CSV da coleta em data/source-snapshots/; o pacote cobre 2012–2025 e não muda com linhas novas de 2026.
export const HISTORICAL_SOURCE = {
  url: 'https://www.football-data.co.uk/new/BR.csv',
  localFileMtime: '2026-11-04T10:52:14-03:00',
  sha256: '${csvSha256}',
} as const

export type HistoricalMatch = [homeIndex: number, awayIndex: number, homeGoals: number, awayGoals: number, kickoff: string, sourceOrdinal: number]

export interface HistoricalSeason {
  year: number
  teamIds: string[]
  matches: HistoricalMatch[]
  /** Totais finais oficiais: presente somente nas temporadas com validação independente (2021–2025). */
  officialStandings?: [teamId: string, points: number, played: number, wins: number, draws: number, losses: number, goalsFor: number, goalsAgainst: number][]
  validation: { matches: number; clubs: number; standingsVerified: boolean }
}

export const historicalSeasons: HistoricalSeason[] = [
${seasonBlocks.join('\n')}
]
`

  writeFileSync(join(root, 'src/historicalSeasons.ts'), file)
  const totalMatches = [...seasons.values()].reduce((sum, season) => sum + season.matches.length, 0)
  console.log(`Empacotadas ${seasonBlocks.length} temporadas (${FIRST_YEAR}–${LAST_YEAR}), ${totalMatches} partidas. Sem placar: ${skipped.length}.`)
}

main()
