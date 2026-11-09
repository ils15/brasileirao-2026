/**
 * Empacotador determinístico do histórico descritivo 2003–2025.
 * 2003–2011: snapshots OpenFootball CC0 fixados em commit.
 * 2012–2025: CSV Football-Data já usado pelo projeto; mantém seus placares,
 * kickoffs, ordinais e tabelas verificadas sem alteração semântica.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT_DIR = join(root, 'data/source-snapshots/openfootball-br-2003-2011')
const OPENFOOTBALL_COMMIT = '1aae6a91b196f7c55224cd47ee4a31431d45fe3a'
const OPENFOOTBALL_REPOSITORY = 'https://github.com/jackdepaula/br-brazil'
const EXPECTED_CLUBS = new Map([[2003, 24], [2004, 24], [2005, 22], ...Array.from({ length: 6 }, (_, i) => [2006 + i, 20])])
export const OPENFOOTBALL_BLOBS = {
  2003: 'd1710bde80e761d0f8f804e35f0b7139a39a66e1',
  2004: 'd8a00e809e7a14a12c7c25c045b3641233fab773',
  2005: 'e813115ca636166158ce0e6a101409168a00db21',
  2006: 'bc09623afb0fff1fafd59c460acb497de4f1fe21',
  2007: '9817957f8ba5ed82c158b16f95641e9070fad9d9',
  2008: '4c65ccc4d023a33f66a8c95eeec8347fb76a2eb4',
  2009: '9f418b93cffa5191471328211ac65c4b6fca1129',
  2010: 'f1e9745bf0b88bd3488773416a51880c2fb34ceb',
  2011: 'd490f0e54f93e74c98f7eca8678dc5efc1d35379',
}
const EXPECTED_MATCHES = new Map([[2003, 552], [2004, 552], [2005, 473], ...Array.from({ length: 6 }, (_, i) => [2006 + i, 380])])
const KNOWN_REPLAY_PAIRS_2005 = [
  'botafogo|cruzeiro', 'botafogo|vasco', 'brasiliense|fluminense', 'corinthians|santos',
  'corinthians|saopaulo', 'coritiba|internacional', 'cruzeiro|paysandu', 'figueirense|juventude',
  'figueirense|vasco', 'fluminense|juventude', 'ponte-preta|saopaulo',
]
const RSSSF_SAMPLES = {
  2003: { date: '2003-03-29', home: 'guarani', away: 'vasco', homeGoals: 4, awayGoals: 2 },
  2004: { date: '2004-04-21', home: 'botafogo', away: 'goias', homeGoals: 1, awayGoals: 4 },
  2005: { date: '2005-04-23', home: 'parana', away: 'goias', homeGoals: 0, awayGoals: 2 },
  2006: { date: '2006-04-15', home: 'juventude', away: 'parana', homeGoals: 1, awayGoals: 0 },
  2007: { date: '2007-05-12', home: 'figueirense', away: 'athletico-pr', homeGoals: 3, awayGoals: 6 },
  2008: { date: '2008-05-10', home: 'nautico', away: 'goias', homeGoals: 2, awayGoals: 1 },
  2009: { date: '2009-05-09', home: 'sport', away: 'barueri', homeGoals: 1, awayGoals: 1 },
  2010: { date: '2010-05-08', home: 'botafogo', away: 'santos', homeGoals: 3, awayGoals: 3 },
  2011: { date: '2011-05-21', home: 'ceara', away: 'vasco', homeGoals: 1, awayGoals: 3 },
}

// Existing Football-Data aliases are retained. Historical spellings not
// present in that CSV are explicit here; unknown source names are fatal.
const TEAM_SLUGS = {
  'America MG': 'america-mg', 'Athletico-PR': 'athletico-pr', 'Atletico GO': 'atletico-go',
  'Atletico-MG': 'atletico-mg', Avai: 'avai', Bahia: 'bahia', 'Botafogo RJ': 'botafogo',
  Bragantino: 'bragantino', CSA: 'csa', Ceara: 'ceara', 'Chapecoense-SC': 'chapecoense',
  Corinthians: 'corinthians', Coritiba: 'coritiba', Criciuma: 'criciuma', Cuiaba: 'cuiaba',
  Cruzeiro: 'cruzeiro', Figueirense: 'figueirense', 'Flamengo RJ': 'flamengo',
  Fluminense: 'fluminense', Fortaleza: 'fortaleza', Goias: 'goias', Gremio: 'gremio',
  Internacional: 'internacional', Joinville: 'joinville', Juventude: 'juventude',
  Mirassol: 'mirassol', Nautico: 'nautico', Palmeiras: 'palmeiras', Parana: 'parana',
  'Ponte Preta': 'ponte-preta', Portuguesa: 'portuguesa', 'Santa Cruz': 'santa-cruz',
  Santos: 'santos', 'Sao Paulo': 'saopaulo', 'Sport Recife': 'sport', Vasco: 'vasco',
  Vitoria: 'vitoria',
}

const HISTORICAL_ALIASES = {
  Guarani: 'guarani', Botafogo: 'botafogo', Flamengo: 'flamengo',
  Gremio: 'gremio', 'Grêmio': 'gremio', Sport: 'sport',
  'São Caetano': 'sao-caetano', 'Sao Caetano': 'sao-caetano',
  Paysandu: 'paysandu', Brasiliense: 'brasiliense',
  'América-RN': 'america-rn', 'America-RN': 'america-rn', 'América RN': 'america-rn', 'America RN': 'america-rn',
  América: 'america-mg', 'América-MG': 'america-mg', 'America-MG': 'america-mg',
  Ipatinga: 'ipatinga', 'Santo André': 'santo-andre', 'Santo Andre': 'santo-andre',
  Barueri: 'barueri', 'Grêmio Prudente': 'gremio-prudente', 'Gremio Prudente': 'gremio-prudente',
  'Atlético Paranaense': 'athletico-pr', 'Atletico Paranaense': 'athletico-pr',
  'Atlético Mineiro': 'atletico-mg', 'Atletico Mineiro': 'atletico-mg',
  'Atlético Goianiense': 'atletico-go', 'Atletico Goianiense': 'atletico-go',
  'Atlético PR': 'athletico-pr', 'Atletico PR': 'athletico-pr', 'Atlético - PR': 'athletico-pr',
  'Atlético MG': 'atletico-mg', 'Atletico MG': 'atletico-mg', 'Atlético - MG': 'atletico-mg',
  'Atlético GO': 'atletico-go', 'Atletico GO': 'atletico-go',
  'Vasco da Gama': 'vasco', 'CR Vasco da Gama': 'vasco',
  'São Paulo': 'saopaulo', 'Paraná Clube': 'parana', 'Parana Clube': 'parana',
  Palmeira: 'palmeiras',
}

export const normalizeName = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const historicalSlugs = new Map()
for (const [name, id] of Object.entries({ ...TEAM_SLUGS, ...HISTORICAL_ALIASES })) historicalSlugs.set(normalizeName(name), id)

function historicalSlugOf(name, year, lineNumber) {
  const id = historicalSlugs.get(normalizeName(name))
  if (!id) throw new Error(`Clube histórico desconhecido em ${year}, linha ${lineNumber}: "${name}"`)
  return id
}

function isValidDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
}

function parseSourceDate(line, year) {
  const full = line.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)
  const short = full ? null : line.match(/\b(\d{2})\/(\d{2})\b/)
  if (!full && !short) return null
  const [, dayText, monthText, sourceYear] = full ?? [...short, String(year)]
  const dateYear = Number(sourceYear)
  const day = Number(dayText)
  const month = Number(monthText)
  if (dateYear !== year || !isValidDate(dateYear, month, day)) {
    throw new Error(`Data inválida em ${year}: "${line.trim()}"`)
  }
  return `${dateYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseRound(line) {
  const match = line.match(/^\s*(?:(\d+)\s*(?:ª|º|\.?)\s*Rodada|Rodada\s*(\d+))/i)
  return match ? Number(match[1] ?? match[2]) : null
}

function resolveAwayName(raw) {
  const exact = historicalSlugs.get(normalizeName(raw))
  if (exact) return { name: raw.trim(), id: exact }
  const segments = raw.split(/\s+-\s+/)
  for (let count = segments.length - 1; count > 0; count -= 1) {
    const candidate = segments.slice(0, count).join(' - ').trim()
    const id = historicalSlugs.get(normalizeName(candidate))
    if (id) return { name: candidate, id }
  }
  return null
}

/** Parse the historical score and round formats present in the pinned source. */
export function parseOpenFootballSeason(text, year) {
  const matches = []
  let round = null
  let date = null
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\u00a0/g, ' ').trim()
    if (!line) continue
    const parsedRound = parseRound(line)
    if (parsedRound != null) round = parsedRound
    const parsedDate = parseSourceDate(line, year)
    if (parsedDate) date = parsedDate
    if (/^\s*\[.*\d{2}\/\d{2}.*\]\s*$/.test(line)) continue
    // OpenFootball 2004 prints the abandoned 0-0 interval as a separate row;
    // RSSSF documents that the remaining 31 minutes were played on Nov 3 and
    // the final result was 4-2. Keep only the completed score record below.
    if (/\*\s*\d{1,2}\s*x\s*\d{1,2}\s*\*/i.test(line)) continue

    // A score marker is only meaningful on a fixture row; date strings are
    // parsed above and never contain these x/hyphen score separators.
    const score = /(\d{1,2})\s*(x|-)\s*(\d{1,2})/i.exec(line)
    if (!score) continue
    if (/\*\s*\d{1,2}\s*x\s*\d{1,2}\s*\*/i.test(line)) continue
    if (round == null || date == null) throw new Error(`Rodada/data ausente em ${year}, linha ${index + 1}: "${line}"`)

    let before = line.slice(0, score.index).trim()
    before = before.replace(/^\d{1,2}h\d{0,2}\s*[-–]\s*/i, '').trim()
    const after = line.slice(score.index + score[0].length).trim()
    const home = historicalSlugOf(before, year, index + 1)
    const awayResult = resolveAwayName(after)
    if (!awayResult) throw new Error(`Clube histórico desconhecido em ${year}, linha ${index + 1}: "${after}"`)
    const away = awayResult.id
    const homeGoals = Number(score[1])
    const awayGoals = Number(score[3])
    if (home === away) throw new Error(`Autoconfronto em ${year}, rodada ${round}, linha ${index + 1}: "${line}"`)
    if (![homeGoals, awayGoals].every((goals) => Number.isInteger(goals) && goals >= 0)) {
      throw new Error(`Placar inválido em ${year}, linha ${index + 1}: "${line}"`)
    }
    matches.push({
      round,
      date,
      home,
      away,
      homeGoals,
      awayGoals,
      kickoff: `${date}T00:00`,
      sourceOrdinal: matches.length + 1,
    })
  }
  if (matches.length === 0) throw new Error(`Nenhum placar OpenFootball encontrado em ${year}.`)
  return matches
}

/** Structural audit intentionally treats the same pair on different rounds as distinct fixtures. */
export function auditOpenFootballSeason(matches, year) {
  const clubs = [...new Set(matches.flatMap(({ home, away }) => [home, away]))].sort()
  const expectedClubs = EXPECTED_CLUBS.get(year)
  const clubCounts = new Map(clubs.map((club) => [club, { home: 0, away: 0, total: 0 }]))
  const fixtureKeys = new Set()
  const duplicateFixtures = []
  const invalidFixtures = []
  const pairs = new Map()
  for (const match of matches) {
    const countsHome = clubCounts.get(match.home)
    const countsAway = clubCounts.get(match.away)
    const [month, day] = match.date.slice(5).split('-').map(Number)
    if (!countsHome || !countsAway || match.home === match.away || !isValidDate(year, month, day)) {
      invalidFixtures.push(match.sourceOrdinal)
    }
    if (countsHome) { countsHome.home += 1; countsHome.total += 1 }
    if (countsAway) { countsAway.away += 1; countsAway.total += 1 }
    const fixtureKey = `${match.round}|${match.date}|${match.home}|${match.away}`
    if (fixtureKeys.has(fixtureKey)) duplicateFixtures.push(match.sourceOrdinal)
    fixtureKeys.add(fixtureKey)
    const pairKey = [match.home, match.away].sort().join('|')
    pairs.set(pairKey, (pairs.get(pairKey) ?? 0) + 1)
  }
  const perClub = [...clubCounts.entries()].map(([club, count]) => ({ club, ...count }))
  const expectedPerClub = expectedClubs == null ? null : 2 * (expectedClubs - 1)
  return {
    clubs: clubs.length,
    expectedClubs,
    matches: matches.length,
    clubCountValid: expectedClubs === clubs.length,
    duplicateFixtures,
    invalidFixtures,
    perClub,
    expectedPerClub,
    perClubDifferences: expectedPerClub == null ? [] : perClub.filter(({ total }) => total !== expectedPerClub),
    repeatedPairs: [...pairs.entries()].filter(([, count]) => count > 2).map(([pair, count]) => ({ pair, count })),
    deterministicOrder: matches.every((match, index) => match.sourceOrdinal === index + 1),
  }
}

function validateOpenFootballAudit(audit, matches, year) {
  if (!audit.clubCountValid || audit.matches !== EXPECTED_MATCHES.get(year) || audit.duplicateFixtures.length
    || audit.invalidFixtures.length || !audit.deterministicOrder) {
    throw new Error(`Falha estrutural em ${year}: ${JSON.stringify(audit)}`)
  }
  const repeatedPairs = audit.repeatedPairs.map(({ pair }) => pair).sort()
  if (year !== 2005) {
    if (repeatedPairs.length > 0 || audit.perClubDifferences.length > 0) {
      throw new Error(`Divergência sem replay documentado em ${year}: ${JSON.stringify(audit)}`)
    }
    return
  }
  if (JSON.stringify(repeatedPairs) !== JSON.stringify([...KNOWN_REPLAY_PAIRS_2005].sort())) {
    throw new Error(`Conjunto de replays inesperado em 2005: ${JSON.stringify(repeatedPairs)}`)
  }
  const baselinePerClub = audit.expectedPerClub
  const expectedExtra = new Map(audit.perClub.map(({ club }) => [club, { home: 0, away: 0 }]))
  const countsByPair = new Map()
  for (const match of matches) {
    const pair = [match.home, match.away].sort().join('|')
    countsByPair.set(pair, [...(countsByPair.get(pair) ?? []), match])
  }
  for (const pair of KNOWN_REPLAY_PAIRS_2005) {
    const replays = countsByPair.get(pair) ?? []
    if (replays.length !== 3) throw new Error(`Replay 2005 sem exatamente três registros de par ${pair}.`)
    const byDirection = new Map()
    for (const match of replays) {
      const direction = `${match.home}|${match.away}`
      byDirection.set(direction, [...(byDirection.get(direction) ?? []), match])
    }
    const repeatedDirection = [...byDirection.values()].find((direction) => direction.length === 2)
    if (!repeatedDirection) throw new Error(`Replay 2005 sem a repetição de mando esperada para ${pair}.`)
    const extra = [...repeatedDirection].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal)[1]
    expectedExtra.get(extra.home).home += 1
    expectedExtra.get(extra.away).away += 1
  }
  const mismatched = audit.perClub.filter(({ club, home, away, total }) => {
    const extra = expectedExtra.get(club)
    return total !== baselinePerClub + extra.home + extra.away
      || home !== EXPECTED_CLUBS.get(year) - 1 + extra.home
      || away !== EXPECTED_CLUBS.get(year) - 1 + extra.away
  })
  if (mismatched.length > 0) throw new Error(`Divergência de partidas por clube em 2005 além dos 11 replays: ${JSON.stringify(mismatched)}`)
}

export function validateRsssfSample(matches, year) {
  const sample = RSSSF_SAMPLES[year]
  if (!sample) throw new Error(`Amostra RSSSF ausente para ${year}.`)
  const found = matches.some((match) => match.date === sample.date && match.home === sample.home && match.away === sample.away
    && match.homeGoals === sample.homeGoals && match.awayGoals === sample.awayGoals)
  if (!found) throw new Error(`Amostra RSSSF não corresponde ao snapshot OpenFootball em ${year}: ${JSON.stringify(sample)}`)
  return sample
}

function validatePinnedSnapshot(year, bytes) {
  const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (blobSha !== OPENFOOTBALL_BLOBS[year]) {
    throw new Error(`Snapshot OpenFootball ${year} diverge do blob fixado: esperado ${OPENFOOTBALL_BLOBS[year]}, recebido ${blobSha}.`)
  }
  return { blobSha, sha256: createHash('sha256').update(bytes).digest('hex') }
}

const FIRST_FOOTBALL_DATA_YEAR = 2012
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
  const temporaryPath = '/tmp/standings-2021-2025.json'
  try {
    const json = JSON.parse(readFileSync(temporaryPath, 'utf8'))
    return new Map(Object.entries(json).map(([year, standings]) => [Number(year), standings]))
  } catch {
    // The generator's original handoff file is ephemeral. Reuse only the
    // independently verified rows already embedded in the checked-in bundle.
    const source = readFileSync(join(root, 'src/historicalSeasons.ts'), 'utf8')
    const result = new Map()
    for (const year of VERIFIED_YEARS) {
      const seasonStart = source.indexOf(`year: ${year},`)
      const nextSeason = source.indexOf('year: ', seasonStart + 7)
      const section = source.slice(seasonStart, nextSeason < 0 ? undefined : nextSeason)
      const block = section.match(/officialStandings:\s*\[([\s\S]*?)\n\s*\],/)
      if (!block) throw new Error(`Standings verificadas ausentes para ${year}; forneça ${temporaryPath}.`)
      const rows = [...block[1].matchAll(/\['([^']+)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g)]
        .map((row) => [row[1], ...row.slice(2).map(Number)])
      result.set(year, rows)
    }
    return result
  }
}

function parseFootballData(csvText) {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const skipped = []
  const seasons = new Map()
  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(',')
    if (columns.length < 10 || columns[0] !== 'Brazil' || columns[1] !== 'Serie A') continue
    const year = Number(columns[2])
    if (!Number.isInteger(year) || year < FIRST_FOOTBALL_DATA_YEAR || year > LAST_YEAR) continue
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
  return { seasons, skipped }
}

function seasonBlock(season, { standings = null, provenance = null, standingsVerified = false }) {
  const teamIds = [...new Set(season.matches.flatMap(({ home, away }) => [home, away]))].sort((a, b) => a.localeCompare(b))
  const teamIndex = new Map(teamIds.map((id, index) => [id, index]))
  const ordered = [...season.matches]
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || (a.csvLine ?? a.sourceOrdinal) - (b.csvLine ?? b.sourceOrdinal))
    .map((match, index) => ({ ...match, ordinal: index + 1 }))
  const matchLines = ordered.map((match) =>
    `    [${teamIndex.get(match.home)}, ${teamIndex.get(match.away)}, ${match.homeGoals}, ${match.awayGoals}, '${match.kickoff}', ${match.ordinal}],`)
    .join('\n')
  let block = `  {\n    year: ${season.year},\n    teamIds: [${teamIds.map((id) => `'${id}'`).join(', ')}],\n    matches: [\n${matchLines}\n    ],\n`
  if (standings) {
    const standingLines = standings.map((row) => `      ['${row[0]}', ${row[1]}, ${row[2]}, ${row[3]}, ${row[4]}, ${row[5]}, ${row[6]}, ${row[7]}],`).join('\n')
    block += `    officialStandings: [\n${standingLines}\n    ],\n`
  }
  if (provenance) block += `    provenance: ${JSON.stringify(provenance)},\n`
  block += `    validation: { matches: ${ordered.length}, clubs: ${teamIds.length}, standingsVerified: ${standingsVerified} },\n  },`
  return block
}

function renderHistory(legacy, historical, skipped, csvSha256, verifiedStandings) {
  const blocks = []
  for (const year of [...historical.keys()].sort((a, b) => a - b)) {
    const raw = readFileSync(join(SNAPSHOT_DIR, `${year}.txt`))
    const { blobSha, sha256 } = validatePinnedSnapshot(year, raw)
    const matches = parseOpenFootballSeason(raw.toString('utf8'), year)
    const audit = auditOpenFootballSeason(matches, year)
    validateOpenFootballAudit(audit, matches, year)
    validateRsssfSample(matches, year)
    const sourcePath = `${year}/brasileirao-seriea.txt`
    const sourceUrl = `${OPENFOOTBALL_REPOSITORY}/blob/${OPENFOOTBALL_COMMIT}/${sourcePath}`
    const season = { year, matches }
    blocks.push(seasonBlock(season, {
      provenance: {
        source: 'OpenFootball', fork: 'jackdepaula/br-brazil', url: sourceUrl,
        rawUrl: `https://raw.githubusercontent.com/jackdepaula/br-brazil/${OPENFOOTBALL_COMMIT}/${sourcePath}`,
        commit: OPENFOOTBALL_COMMIT, file: sourcePath, blobSha, sha256,
        license: 'CC0-1.0', licenseFile: 'LICENSE.md', attribution: 'OpenFootball — fork jackdepaula/br-brazil',
        rsssfSampleVerified: true,
      },
    }))
  }

  for (const year of [...legacy.keys()].sort((a, b) => a - b)) {
    const season = legacy.get(year)
    const standingsVerified = VERIFIED_YEARS.has(year)
    const standings = standingsVerified ? verifiedStandings.get(year) : null
    if (standingsVerified && (!standings || standings.length !== 20)) throw new Error(`Standings verificados ausentes para ${year}.`)
    blocks.push(seasonBlock(season, { standings, standingsVerified }))
  }
  const totalSeasons = historical.size + legacy.size
  const totalMatches = [...historical.values(), ...legacy.values()].reduce((sum, season) => sum + season.matches.length, 0)
  const skippedNote = skipped.length > 0
    ? `\n// Partidas registradas sem placar no CSV e não empacotadas: ${skipped.map(({ year, date, home, away }) => `${home} × ${away} (${date}, ${year})`).join('; ')}.`
    : ''
  return `// Placares empacotados do OpenFootball (2003–2011) e Football-Data (2012–2025), ${totalSeasons} temporadas, ${totalMatches} partidas; gerado por scripts/pack-history.mjs.\n// Histórico descritivo/H2H; somente temporadas a partir de 2012 podem alimentar treino, projeção, calibração e backtest.\n// Kickoff sem fuso: OpenFootball normaliza toda data para T00:00 (a hora da fonte é descartada); Football-Data mantém a hora do CSV.\n// O campo sourceOrdinal (6º) é o índice cronológico 1-based do pacote — ordenado por kickoff, desempate pela ordem de leitura —, não o ordinal da fonte.${skippedNote}\n// SHA-256 do CSV Football-Data em data/source-snapshots/; tabela final independente: somente 2021–2025.\nexport const HISTORICAL_SOURCE = {\n  url: 'https://www.football-data.co.uk/new/BR.csv',\n  localFileMtime: '2026-11-04T10:52:14-03:00',\n  sha256: '${csvSha256}',\n} as const\n\nexport const OPENFOOTBALL_SOURCE = {\n  repository: '${OPENFOOTBALL_REPOSITORY}',\n  commit: '${OPENFOOTBALL_COMMIT}',\n  license: 'CC0-1.0',\n  licenseFile: 'data/source-snapshots/openfootball-br-2003-2011/LICENSE.md',\n} as const\n\nexport type HistoricalMatch = [homeIndex: number, awayIndex: number, homeGoals: number, awayGoals: number, kickoff: string, sourceOrdinal: number]\n\nexport interface HistoricalProvenance {\n  source: 'OpenFootball'\n  fork: string\n  url: string\n  rawUrl: string\n  commit: string\n  file: string\n  blobSha: string\n  sha256: string\n  license: 'CC0-1.0'\n  licenseFile: string\n  attribution: string\n  rsssfSampleVerified: boolean\n}\n\nexport interface HistoricalSeason {\n  year: number\n  teamIds: string[]\n  matches: HistoricalMatch[]\n  /** Totais finais oficiais: presente somente nas temporadas com validação independente (2021–2025). */\n  officialStandings?: [teamId: string, points: number, played: number, wins: number, draws: number, losses: number, goalsFor: number, goalsAgainst: number][]\n  provenance?: HistoricalProvenance\n  validation: { matches: number; clubs: number; standingsVerified: boolean }\n}\n\nexport const historicalSeasons: HistoricalSeason[] = [\n${blocks.join('\n')}\n]\n\n/** All seasons available to descriptive views; not a model input. */\nexport const historicalQueryableSeasons = historicalSeasons\n/** Explicit modeling boundary: pre-2012 seasons are never passed to any model path. */\nexport const modelableHistoricalSeasons = historicalSeasons.filter((season) => season.year >= 2012)\n`
}

function main() {
  const csvText = readFileSync(join(root, 'data/source-snapshots/football-data-BR.csv'), 'utf8')
  const csvSha256 = createHash('sha256').update(csvText, 'utf8').digest('hex')
  const { seasons: legacy, skipped } = parseFootballData(csvText)
  const historical = new Map()
  for (let year = 2003; year <= 2011; year += 1) {
    const snapshot = readFileSync(join(SNAPSHOT_DIR, `${year}.txt`))
    historical.set(year, { year, matches: parseOpenFootballSeason(snapshot.toString('utf8'), year) })
  }
  const source = renderHistory(legacy, historical, skipped, csvSha256, loadVerifiedStandings())
  writeFileSync(join(root, 'src/historicalSeasons.ts'), source)
  console.log(`Empacotadas ${historical.size + legacy.size} temporadas (2003–2025), ${[...historical.values(), ...legacy.values()].reduce((sum, season) => sum + season.matches.length, 0)} partidas.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
