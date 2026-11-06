import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { loadCbfSchedule, computeStandings, computeRemaining, validateIntegrity, renderCurrentSeasonResults, renderProjectionData } from './lib/dataPipeline.mjs'

const root = '/home/ils15/dev/tests/br2026'
const srcDir = join(root, 'src')
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

const current = readFileSync(join(srcDir, 'currentSeasonResults.ts'), 'utf8')
const results = current.split('\n').filter((line) => line.trim().startsWith('{ home:')).map((line) => {
  const m = line.match(/home: "([^"]+)", away: "([^"]+)", homeGoals: (\d+), awayGoals: (\d+), kickoff: "([^"]+)", source: "([^"]+)", sourceRef: "([^"]+)"/)
  if (!m) throw new Error('linha não parseável: ' + line)
  return { home: m[1], away: m[2], homeGoals: +m[3], awayGoals: +m[4], kickoff: m[5], source: m[6], sourceRef: m[7] }
})

const schedule = loadCbfSchedule(srcDir)
const standings = computeStandings(results, schedule)
const remaining = computeRemaining(results, schedule)
validateIntegrity({ schedule, results, remaining })

const csvText = readFileSync(join(root, 'data/source-snapshots/football-data-BR.csv'), 'utf8')
const espnFiles = readdirSync(join(root, 'data/source-snapshots')).filter((f) => f.startsWith('espn-scoreboard-')).sort()
const espnText = espnFiles.map((f) => readFileSync(join(root, 'data/source-snapshots', f), 'utf8')).join('|')

const metadata = {
  generatedAt: new Date().toISOString(),
  collectedAt: current.match(/collectedAt: '([^']+)'/)?.[1] ?? new Date().toISOString(),
  sha256: sha256(csvText),
  rows2026: (csvText.match(/,2026,/g) ?? []).length,
  espnCount: results.filter((r) => r.source === 'espn').length,
  espnSha256: sha256(espnText),
  historicalSha256: 'ed5c0925007f9ae35f97558993e597d41807e3f1507fae9d7e555bbab5b02bcf',
  cbfDisplayed: current.match(/displayedTimestamp: '([^']+)'/)?.[1] ?? '04/11/2026 - 19:41',
}

writeFileSync(join(srcDir, 'currentSeasonResults.ts'), renderCurrentSeasonResults({ results, metadata }))

const ESPN_TEAM_IDS = {
  flamengo: 819, palmeiras: 2029, cruzeiro: 2022, fluminense: 3445, 'athletico-pr': 3458,
  bahia: 9967, 'atletico-mg': 7632, bragantino: 6079, santos: 2674, 'sao-paulo': 2026,
  botafogo: 6086, coritiba: 3456, vasco: 3454, mirassol: 9169, vitoria: 3457,
  internacional: 1936, corinthians: 874, gremio: 6273, remo: 4936, chapecoense: 9318,
}
const DISPLAY_NAMES = {
  flamengo: 'Flamengo', palmeiras: 'Palmeiras', cruzeiro: 'Cruzeiro', fluminense: 'Fluminense',
  'athletico-pr': 'Athletico Paranaense', bahia: 'Bahia', 'atletico-mg': 'Atlético Mineiro',
  bragantino: 'Red Bull Bragantino', santos: 'Santos FC', 'sao-paulo': 'São Paulo',
  botafogo: 'Botafogo', coritiba: 'Coritiba SAF', vasco: 'Vasco da Gama SAF', mirassol: 'Mirassol',
  vitoria: 'Vitória', internacional: 'Internacional', corinthians: 'Corinthians', gremio: 'Grêmio',
  remo: 'Remo', chapecoense: 'Chapecoense',
}
const INITIALS = {
  flamengo: 'FLA', palmeiras: 'PAL', cruzeiro: 'CRU', fluminense: 'FLU', 'athletico-pr': 'CAP',
  bahia: 'BAH', 'atletico-mg': 'CAM', bragantino: 'RBB', santos: 'SAN', 'sao-paulo': 'SAO',
  botafogo: 'BOT', coritiba: 'CFC', vasco: 'VAS', mirassol: 'MIR', vitoria: 'VIT',
  internacional: 'INT', corinthians: 'COR', gremio: 'GRE', remo: 'REM', chapecoense: 'CHA',
}
const displayNameFor = Object.fromEntries(
  Object.keys(ESPN_TEAM_IDS).map((id) => [id, { club: DISPLAY_NAMES[id], initials: INITIALS[id] }]),
)
writeFileSync(join(srcDir, 'projectionData.ts'), renderProjectionData({
  standings, remaining, displayNameFor, espnTeamIdsJson: JSON.stringify(ESPN_TEAM_IDS),
}))
console.log('re-render ok:', results.length, 'resultados,', remaining.length, 'pendentes,', espnFiles.length, 'snapshots espn')
