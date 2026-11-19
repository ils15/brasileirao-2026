/**
 * Atualização pós-rodada: coleta Football-Data + ESPN desde o último corte,
 * valida, regenera os módulos de dados e, se houver novidade e a suíte passar,
 * registra o commit. Deploy é responsabilidade do workflow chamador.
 *
 * Uso:
 *   node scripts/update-data.mjs --dry-run   # coleta/mostra diff sem escrever
 *   node scripts/update-data.mjs             # escreve, roda testes e commita
 *   node scripts/update-data.mjs --offline --no-commit --today=2026-11-16 \
 *     --test="npx vitest run src/a.test.tsx"  # reprodução determinística sem rede
 *
 * Sem rede (CI local/dry/--offline), usa fixtures locais de data/source-snapshots/.
 * O contrato das flags mora em scripts/lib/updateArgs.mjs.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { refreshAdvancedStats } from './backfill-xg-cards.mjs'
import { refreshEspnScorers } from './refresh-espn-scorers.mjs'
import { assertCutoffNotAfterToday, parseUpdateArgs } from './lib/updateArgs.mjs'
import {
  classifyMergeOutcome,
  parseEspnStandings,
  parseValorfinalClubes,
  reconcileStandings,
  computeRemaining,
  computeStandings,
  formatBrazilLocalIso,
  loadCbfSchedule,
  mergeResults,
  parseEspnScoreboard,
  parseFootballDataCsv,
  planCollectionRun,
  summarizeEspnFootballDataCoverage,
  overduePending,
  readCurrentCutoff,
  renderCurrentSeasonResults,
  renderProjectionData,
  renderSourceMetadata,
  validateIntegrity,
} from './lib/dataPipeline.mjs'
import { renderUpdateLog, updateLogTotals } from './lib/updateLog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const snapshotsDir = join(root, 'data/source-snapshots')
const options = parseUpdateArgs(process.argv.slice(2))
const dryRun = options.dryRun
const offline = options.offline
const BR_CSV_URL = 'https://www.football-data.co.uk/new/BR.csv'
const ESPN_URL_TEMPLATE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates='
const DISPLAY_NAMES = {
  'flamengo': { club: 'Flamengo', initials: 'FLA' },
  'palmeiras': { club: 'Palmeiras', initials: 'PAL' },
  'cruzeiro': { club: 'Cruzeiro', initials: 'CRU' },
  'fluminense': { club: 'Fluminense', initials: 'FLU' },
  'athletico-pr': { club: 'Athletico Paranaense', initials: 'CAP' },
  'bahia': { club: 'Bahia', initials: 'BAH' },
  'atletico-mg': { club: 'Atlético Mineiro', initials: 'CAM' },
  'bragantino': { club: 'Red Bull Bragantino', initials: 'RBB' },
  'santos': { club: 'Santos FC', initials: 'SAN' },
  'sao-paulo': { club: 'São Paulo', initials: 'SAO' },
  'coritiba': { club: 'Coritiba SAF', initials: 'CFC' },
  'mirassol': { club: 'Mirassol', initials: 'MIR' },
  'botafogo': { club: 'Botafogo', initials: 'BOT' },
  'vasco': { club: 'Vasco da Gama SAF', initials: 'VAS' },
  'vitoria': { club: 'Vitória', initials: 'VIT' },
  'internacional': { club: 'Internacional', initials: 'INT' },
  'gremio': { club: 'Grêmio', initials: 'GRE' },
  'corinthians': { club: 'Corinthians', initials: 'COR' },
  'remo': { club: 'Remo', initials: 'REM' },
  'chapecoense': { club: 'Chapecoense', initials: 'CHA' },
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'brasileirao-2026-updater/1.0' } })
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`)
  return response.text()
}

function utcDateOf(iso) {
  return iso.slice(0, 10)
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options })
}

/** Executa o comando do gate como shell (aceita `--test="cmd arg arg"`). */
function runShell(command) {
  execFileSync('sh', ['-c', command], { cwd: root, stdio: 'inherit' })
}

/** Lê um snapshot local; com `--offline`, ausência é erro (nunca cai para a rede). */
function readLocalSnapshotOrFail(path) {
  if (!existsSync(path)) {
    throw new Error(`--offline exige snapshot local ausente: ${path.replace(`${root}/`, '')}`)
  }
  return readFileSync(path, 'utf8')
}

async function main() {
  const schedule = loadCbfSchedule(srcDir)
  const currentMetadataSource = readFileSync(join(srcDir, 'currentSeasonResults.ts'), 'utf8')
  const currentResultsSource = readFileSync(join(srcDir, 'currentSeasonResults.ts'), 'utf8')
  const existingResults = currentResultsSource
    .split('\n')
    .filter((line) => line.trim().startsWith('{ home:'))
    .map((line) => {
      const match = line.match(/home: "([^"]+)", away: "([^"]+)", homeGoals: (\d+), awayGoals: (\d+), kickoff: "([^"]+)", source: "([^"]+)", sourceRef: "([^"]+)"/)
      if (!match) throw new Error(`Linha de resultado não parseável no empacotamento atual: ${line}`)
      return { home: match[1], away: match[2], homeGoals: Number(match[3]), awayGoals: Number(match[4]), kickoff: match[5], source: match[6], sourceRef: match[7] }
    })
  const cutoffUtc = options.cutoff ?? readCurrentCutoff(readFileSync(join(srcDir, 'sourceMetadata.ts'), 'utf8'))
  const lastCutoffDate = utcDateOf(cutoffUtc)
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  if (options.cutoff !== null) {
    // `--cutoff` explícito é contrato de reprodução: coerência vale mesmo quando
    // `--today` cai no relógio, em vez de seguir para o "nada a atualizar".
    assertCutoffNotAfterToday({ cutoffUtc, today })
  }
  console.log(`${options.cutoff !== null ? 'Corte (--cutoff)' : 'Corte empacotado'}: ${cutoffUtc} · hoje (UTC): ${today}`)

  if (today < lastCutoffDate) {
    console.log('Corte empacotado é posterior ao dia atual; nada a atualizar.')
    process.exit(0)
  }
  // Mesmo dia do corte: re-coleta só as fontes primárias. Um jogo que termina
  // depois do corte no mesmo dia UTC não pode esperar ~24h; as fontes
  // secundárias (365scores/eventos ESPN) têm orçamento próprio e só rodam
  // quando há dia novo.
  const plan = planCollectionRun({ today, lastCutoffDate })
  console.log(plan.refreshSecondary
    ? 'Dia novo desde o corte: coleta completa, com fontes secundárias.'
    : 'Mesmo dia do corte: re-coleta primária (ESPN/Football-Data); fontes secundárias preservadas.')

  // 1. Coleta: CSV Football-Data + scoreboards ESPN de cada dia desde o corte.
  const localCsv = join(snapshotsDir, 'football-data-BR.csv')
  const useLocalCsv = existsSync(localCsv) && (dryRun || !process.env.FETCH)
  const csvText = useLocalCsv
    ? readFileSync(localCsv, 'utf8')
    : offline
      ? readLocalSnapshotOrFail(localCsv)
      : await fetchText(BR_CSV_URL)
  const espnMatches = []
  const espnSnapshots = new Map()
  // Coleta a partir do próprio dia do corte: jogos da noite do corte (após o
  // instante 16:00Z) são novos e o parse já filtra por kickoff ≤ limite.
  for (let date = lastCutoffDate; date <= today; date = addDays(date, 1)) {
    const localJson = join(snapshotsDir, `espn-scoreboard-${date}.json`)
    let jsonText
    const useLocalJson = existsSync(localJson) && (dryRun || !process.env.FETCH)
    if (useLocalJson) {
      jsonText = readFileSync(localJson, 'utf8')
    } else if (offline) {
      jsonText = readLocalSnapshotOrFail(localJson)
    } else {
      jsonText = await fetchText(`${ESPN_URL_TEMPLATE}${date.replaceAll('-', '')}`)
      espnSnapshots.set(date, jsonText)
    }
    espnMatches.push(...parseEspnScoreboard(jsonText, { cutoffUtc: `${today}T23:59:59Z` }))
  }

  // 2. Football-Data: toda a temporada com corte no dia corrente (conservador).
  const cutoffDateForFd = today
  const fdMatches = parseFootballDataCsv(csvText, { seasonYear: 2026, cutoffDate: cutoffDateForFd })

  // 3. Fusão com os existentes (precedência do empacotamento anterior).
  const incoming = [...fdMatches, ...espnMatches]
  const { merged, added, rejected } = mergeResults({ schedule, existing: existingResults, incoming })
  const outcome = classifyMergeOutcome({ incoming, added, rejected })
  const espnCoverage = summarizeEspnFootballDataCoverage(merged, fdMatches)
  console.log(`Novos efetivos: ${added.length} (FD ${fdMatches.length}, ESPN ${espnMatches.length}) · rejeitados: ${rejected.length}`)

  // Par fora do calendário não é no-op: é sinal de fonte ou calendário
  // divergentes. Publicar o resto esconderia o problema — aborta o run.
  if (outcome === 'rejected') {
    const pairs = rejected.map(({ match, reason }) => `- ${match.home} × ${match.away}: ${reason}`).join('\n')
    throw new Error(`Coleta rejeitada: ${rejected.length} par(es) fora do calendário CBF 2026; nada foi publicado.\n${pairs}`)
  }

  if (outcome === 'no-input') {
    // Zero candidatos nas duas fontes. Se existe furo de rodada anterior
    // (jogo sem resultado numa rodada que já começou), o silêncio é suspeito:
    // avisa alto sem falhar, porque pode simplesmente não haver jogo no dia.
    const remaining = computeRemaining(merged, schedule)
    const overdue = overduePending({ schedule, results: merged, remaining })
    if (overdue.length > 0) {
      console.log(`::warning::Sem entrada de resultados na coleta (${incoming.length} candidatos) e ${overdue.length} jogo(s) pendente(s) de rodada anterior; corte empacotado ${cutoffUtc}.`)
    } else {
      console.log('Sem entrada de resultados na coleta e sem pendente de rodada anterior; nada a publicar.')
    }
    process.exit(0)
  }

  if (outcome === 'duplicates-only') {
    console.log(`::notice::Nenhum resultado novo: ${incoming.length} candidato(s) da coleta já estavam empacotados; nada a publicar.`)
    process.exit(0)
  }

  // 4. Derivados e validação de integridade — nada é publicado se falhar.
  const standings = computeStandings(merged, schedule)
  const remaining = computeRemaining(merged, schedule)
  validateIntegrity({ schedule, results: merged, remaining })
  console.log(`Integridade ok: ${merged.length} disputados + ${remaining.length} pendentes = ${schedule.length}`)

  // Conciliação independente: ESPN standings + valorfinal dados abertos.
  // Se ambas divergirem da nossa tabela, provavelmente perdemos resultados
  // — abortar sem publicar. `--offline` pula a etapa porque não há rede.
  if (offline) {
    console.log('  Conciliação externa ignorada (--offline).')
  } else {
    try {
      const espnStandingsText = await fetchText('https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings?season=2026')
      const espnRows = parseEspnStandings(espnStandingsText)
      const vfText = await fetchText('https://valorfinal.com.br/brasileirao/dados.json')
      const vfRows = parseValorfinalClubes(vfText)
      const reconciliation = reconcileStandings({ standings, espn: espnRows, valorfinal: vfRows })
      console.log(`Conciliação: ${espnRows.length} clubes ESPN, ${vfRows.length} valorfinal · divergências ESPN ${reconciliation.espnDiverge}, valorfinal ${reconciliation.vfDiverge}`)
      for (const line of reconciliation.report) console.warn('  ' + line)
      if (reconciliation.espnDiverge > 2) {
        throw new Error(`Conciliação ESPN divergiu em ${reconciliation.espnDiverge} clubes — resultados podem ter sido perdidos.\n${reconciliation.report.join('\n')}`)
      }
    } catch (error) {
      if (error.message.includes('Conciliação')) throw error
      console.warn(`  Conciliação externa indisponível (${error.message.split('\n')[0]}); seguindo só com a integridade interna.`)
    }
  }

  // 4b. Dados avançados 2026 (xG por jogo + cartões) para os jogos novos.
  //     Segue o mesmo padrão de rede das outras fontes: em dry-run local sem
  //     FETCH, usa o snapshot existente e não coleta nada; `--offline` desliga
  //     todas as fontes secundárias.
  const networkAvailable = !offline && (!dryRun || Boolean(process.env.FETCH))
  if (networkAvailable && plan.refreshSecondary) {
    try {
      await refreshAdvancedStats({ log: (line) => console.log(`  ${line}`) })
    } catch (error) {
      // xG/cartões são um bem de segunda ordem: se a fonte falhar HOJE, os
      // dados já empacotados continuam válidos — não bloquear o resultado.
      console.warn(`  Dados avançados indisponíveis nesta coleta (${error.message.split('\n')[0]}); mantendo snapshot anterior.`)
    }
    try {
      // Artilharia derivada dos eventos de partida da ESPN: um snapshot por
      // partida, agregado no módulo. Falha por partida fica isolada (warning).
      await refreshEspnScorers({
        results: merged,
        log: (line) => console.log(`  ${line}`),
        write: !dryRun,
      })
    } catch (error) {
      console.warn(`  Artilharia ESPN indisponível nesta coleta (${error.message.split('\n')[0]}); mantendo snapshot anterior.`)
    }
  }

  // 5. Regeneração dos módulos TS.
  const now = new Date().toISOString()
  const cutoffNewUtc = now.slice(0, 19) + 'Z'
  const cutoffLocal = formatBrazilLocalIso(cutoffNewUtc)
  const processingUtcDate = today
  const espnSnapshotContents = new Map(
    readdirSync(snapshotsDir)
      .filter((file) => /^espn-scoreboard-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map((file) => [file, readFileSync(join(snapshotsDir, file), 'utf8')]),
  )
  for (const [date, jsonText] of espnSnapshots) {
    espnSnapshotContents.set(`espn-scoreboard-${date}.json`, jsonText)
  }
  const espnSnapshotFiles = [...espnSnapshotContents.keys()].sort()
  const metadata = {
    generatedAt: now,
    // O processo não registra o instante individual de captura de cada fonte.
    collectedAt: 'não registrada no snapshot',
    cbfCollectedAt: 'não registrada no snapshot',
    sha256: sha256(csvText),
    rows2026: (csvText.match(/,2026,/g) ?? []).length,
    ...espnCoverage,
    espnFiles: espnSnapshotFiles.map((file) => `data/source-snapshots/${file}`).join(' | '),
    cbfDisplayed: currentMetadataSource.match(/displayedTimestamp: '([^']+)'/)?.[1] ?? 'unknown',
    espnSha256: sha256(espnSnapshotFiles.map((file) => espnSnapshotContents.get(file)).join('|')),
    cbfSha256: sha256(readFileSync(join(snapshotsDir, 'cbf-table-2026.html'))),
    cbfValidation: 'retained standings snapshot not reconciled with the current packed results; no individual scores verified',
    espnTeamIdsJson: readFileSync(join(srcDir, 'projectionData.ts'), 'utf8').match(/ESPN_TEAM_IDS: Readonly<Record<string, number>> = (\{[^}]+\})/)?.[1] ?? '{}',
    historicalSha256: readFileSync(join(srcDir, 'historicalSeasons.ts'), 'utf8').match(/sha256: '([^']+)'/)?.[1] ?? 'unknown',
  }
  const files = {
    'src/currentSeasonResults.ts': renderCurrentSeasonResults({ results: merged, metadata }),
    'src/projectionData.ts': renderProjectionData({ standings, remaining, displayNameFor: DISPLAY_NAMES, espnTeamIdsJson: metadata.espnTeamIdsJson }),
    'src/sourceMetadata.ts': renderSourceMetadata({ cutoffLocal, cutoffUtc: cutoffNewUtc }),
  }

  let changed = 0
  for (const [file, content] of Object.entries(files)) {
    const current = readFileSync(join(root, file), 'utf8')
    if (current !== content) changed += 1
    console.log(`${current === content ? '  sem mudança' : '  atualizar'}: ${file}`)
  }
  if (changed === 0) {
    console.log('Conteúdo regenerado idêntico ao empacotado; nada a publicar.')
    process.exit(0)
  }

  if (dryRun) {
    console.log('DRY RUN: nenhum arquivo foi escrito.')
    for (const match of added) console.log(`  + ${match.home} ${match.homeGoals}–${match.awayGoals} ${match.away} (${match.source} ${match.sourceRef})`)
    process.exit(0)
  }

  // 6. Escrita + snapshots + suíte + commit.
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(root, file), content)
  }
  mkdirSync(snapshotsDir, { recursive: true })
  writeFileSync(join(snapshotsDir, 'football-data-BR.csv'), csvText)
  for (const [date, jsonText] of espnSnapshots) writeFileSync(join(snapshotsDir, `espn-scoreboard-${date}.json`), jsonText)

  // Log de atualizações (entrega pública do histórico): cabeçalho derivado do
  // instante do pacote e entrada com o bloco de fechamento (corte, contagem,
  // adiados). Entradas anteriores são preservadas verbatim.
  const logPath = join(root, 'docs/atualizacoes.md')
  const previousLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : null
  writeFileSync(logPath, renderUpdateLog({
    previous: previousLog,
    entry: {
      date: processingUtcDate,
      added,
      generatedAt: now,
      totals: updateLogTotals({ results: merged, remaining, addedCount: added.length, scheduleLength: schedule.length }),
    },
  }))

  console.log('Executando suíte de testes...')
  runShell(options.testCommand)

  if (options.noCommit) {
    console.log(`--no-commit: gate aprovado, git add/commit não executados (${options.testCommand}).`)
    return
  }

  run('git', ['add', 'src/currentSeasonResults.ts', 'src/projectionData.ts', 'src/sourceMetadata.ts', 'src/advancedStats2026.ts', 'src/scorers2026.ts', 'data/source-snapshots', 'docs/atualizacoes.md'])
  run('git', ['commit', '-m', `data: atualização pós-rodada ${processingUtcDate} (+${added.length} resultados)`])
  console.log(`Commit criado. O workflow faz push, build e deploy.`)
}

main().catch((error) => {
  console.error(`Updater abortado: ${error.message}`)
  process.exit(1)
})
