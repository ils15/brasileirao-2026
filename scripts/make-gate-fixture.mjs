/**
 * Gera/regera a fixture `data/fixtures/gate-repro/` (npm run fixture:gate).
 *
 * A fixture move o pacote com 6 resultados sintéticos e roda o updater com o
 * cenário **vermelho** injetado (`node -e "process.exit(1)"`): se o pacote
 * moveu e o updater abortou depois de escrever, a fixture serve ao harness.
 * O gate não depende mais de arquivos de teste de UI.
 *
 * NENHUM placar tem origem real — a paleta é inventada e fixa. O manifest
 * registra o candidato escolhido no espaço determinístico
 * (`enumerateGateCandidates`), os cenários injetados e o número de tentativas;
 * não alega coleta.
 *
 * Determinismo: mesma árvore → mesmos bytes em `data/fixtures/gate-repro/`.
 * Quando o manifest já registra um vencedor, ele é reconferido com uma única
 * execução do updater (e o metadata anterior é reaproveitado byte a byte). Se
 * o calendário avançou e o conjunto não existe mais, o índice registrado é
 * reconferido no espaço atual.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureBaseline, disposeBaseline, restoreBaseline, verifyBaseline } from './lib/dataBaseline.mjs'
import { loadCbfSchedule, readCurrentCutoff } from './lib/dataPipeline.mjs'
import {
  GATE_SCENARIOS,
  GATE_SEARCH_LIMITS,
  GATE_SEARCH_VERSION,
  SCORE_PALETTE,
  addUtcDays,
  buildFixtureBundle,
  buildScoreboardPayload,
  enumerateGateCandidates,
  gateCandidateSpaceSize,
  parsePackedResults,
  readFixtureBundle,
  serializeJson,
} from './lib/gateFixture.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const fixtureDir = join(root, 'data/fixtures/gate-repro')
const snapshotsDir = join(root, 'data/source-snapshots')

/** Caminhos que a busca escreve e restaura — o updater é o dono deles. */
const DATA_PATHS = [
  'src/currentSeasonResults.ts',
  'src/projectionData.ts',
  'src/sourceMetadata.ts',
  'src/advancedStats2026.ts',
  'src/scorers2026.ts',
  'data/source-snapshots',
  'docs/atualizacoes.md',
]

/** Teto por tentativa: um gate travado não pode consumir o orçamento inteiro. */
const ATTEMPT_TIMEOUT_MS = 180_000

const README = `# Fixture do gate (gate-repro)

## DADOS SINTÉTICOS — não são resultados reais

Este diretório **não** contém coleta de nenhuma fonte nem reconstrução de
placares reais. Os 6 pares e os placares são escolhidos de forma
**determinística** sobre partidas **pendentes** do calendário CBF 2026 e uma
paleta fixa de placares inventados (\`SCORE_PALETTE\` em
\`scripts/lib/gateFixture.mjs\`), no formato do scoreboard da ESPN.

O \`manifest.json\` registra \`baseCutoffUtc\`, \`targetDate\`, os sha256 de cada
arquivo e os dois \`scenarios\` do gate. Nenhum campo alega origem real.

## Para que serve

O updater escreve o pacote **antes** do gate. O harness \`repro:gate\` prova os
dois lados do contrato com comandos de gate **injetados** por \`--test\`, sem
depender de testes de UI (que envelheciam junto com o pacote):

- \`red\` — \`node -e "process.exit(1)"\`: exige exit 1, escrita presente, nenhum
  commit e recibo em \`.pantheon/logs/\` nomeando o comando;
- \`green\` — \`node -e "process.exit(0)"\`: exige exit 0, escrita presente e
  nenhum recibo.

A fixture move o pacote, **offline e determinística**, e o \`manifest.json\` fixa
\`baseCutoffUtc\` e \`targetDate\`: \`repro:gate\` não depende do corte vivo.

\`\`\`bash
npm run fixture:gate   # regenera a fixture a partir do pacote atual
npm run repro:gate     # copia os payloads, roda os dois cenários e restaura a árvore
\`\`\`

\`fixture:gate\` grava o primeiro candidato determinístico que move o pacote no
espaço de pares pendentes; o manifest registra o candidato e os cenários.
O harness roda sobre a árvore de trabalho: por isso \`repro:gate\` captura um
**baseline byte-a-byte** dos caminhos de dados antes de qualquer cópia e
restaura no \`finally\` de **cada** cenário — nunca \`git checkout\`. Alterações
legítimas não commitadas sobrevivem; caminho que não existia antes é removido.
Nenhum arquivo fora dos caminhos de dados é tocado, e os payloads daqui nunca
ficam em \`data/source-snapshots/\`. Nenhum arquivo de \`src/**\` pode importar
deste diretório (há teste vigiando).

## Códigos de saída do \`repro:gate\`

| código | significado |
|---|---|
| 0 | os dois cenários bateram e a árvore voltou ao baseline |
| 2 | a restauração divergiu do baseline (bytes ou \`git status\`) |
| 3 | a fixture é inválida ou não moveu o pacote |
| 4 | a restauração falhou de forma inesperada |
| 5 | um cenário não reproduziu o contrato |

## Arquivos

- \`espn-scoreboard-<data>.json\` — payload sintético; \`<data>\` é o dia do corte + 1.
- \`expected.json\` — os pares que o updater deve incorporar (\`added\`, \`newResults\`).
- \`manifest.json\` — sha256 de cada payload e do expected, \`baseCutoffUtc\` (corte
  a partir do qual a fixture foi gerada), \`targetDate\` (= corte + 1 dia),
  \`scenarios\` (comandos de gate injetados) e o registro do candidato; o harness
  recusa hash divergente.

Não edite à mão: a única forma aceita de mudar a fixture é \`npm run fixture:gate\`.
`

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw new Error(`git ${args.join(' ')} falhou: ${result.error.message}`)
  return result
}

function dataTreeStatus() {
  return git(['status', '--porcelain', '--', ...DATA_PATHS]).stdout.trim()
}

/**
 * Restauração byte-a-byte do baseline. `git checkout` descartaria alterações
 * não commitadas de outra sessão; o baseline devolve só o que esta busca sujou.
 */
function restoreDataPaths(baseline) {
  restoreBaseline(baseline)
  const divergences = verifyBaseline(baseline)
  if (divergences.length > 0) {
    const details = divergences.map(({ path, expected, actual }) => `  - ${path}: esperado ${expected}, obtido ${actual}`).join('\n')
    throw new Error(`restauração divergiu do baseline:\n${details}`)
  }
}

/** Um candidato = uma execução real do updater com o cenário vermelho injetado. */
function runCandidate({ baseline, baseCutoffUtc, targetDate, pairs, expectedAdded }) {
  const gateCommand = GATE_SCENARIOS.find((scenario) => scenario.expect === 'fail').test
  const payloadName = `espn-scoreboard-${targetDate}.json`
  const destination = join(snapshotsDir, payloadName)

  const started = Date.now()
  let output = ''
  let timedOut = false
  let exitCode = 1
  try {
    writeFileSync(destination, serializeJson(buildScoreboardPayload({ targetDate, pairs })))
    const run = spawnSync(
      process.execPath,
      [
        join(root, 'scripts/update-data.mjs'),
        '--offline',
        '--no-commit',
        `--cutoff=${baseCutoffUtc}`,
        `--today=${targetDate}`,
        `--test=${gateCommand}`,
      ],
      { cwd: root, encoding: 'utf8', timeout: ATTEMPT_TIMEOUT_MS },
    )
    output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
    timedOut = run.error?.code === 'ETIMEDOUT' || run.signal === 'SIGTERM'
    exitCode = run.status ?? 1
  } finally {
    restoreDataPaths(baseline)
  }

  const moved = output.split('\n').some((line) => line.startsWith(`Novos efetivos: ${expectedAdded}`))
  return { moved, timedOut, exitCode, seconds: (Date.now() - started) / 1000 }
}

function reproducesFailure(result) {
  return result.moved && result.exitCode === 1
}

function recordedWinner(search) {
  if (!search || search.version !== GATE_SEARCH_VERSION) return null
  if (!Array.isArray(search.winningPairRefs) || typeof search.winningScoreVector !== 'string') return null
  return { pairRefs: search.winningPairRefs, scoreVector: search.winningScoreVector }
}

/**
 * Candidato para reconferência sem busca completa.
 *
 * Primeiro o vencedor registrado (pares + vetor), que é imune a mudança de
 * índice. Se o calendário avançou e o conjunto não existe mais, cai para o
 * candidato de mesmo índice no espaço atual: a ordem da busca é determinística
 * e a execução do candidato decide se ele ainda serve (vermelho ou verde).
 */
function reconfirmationCandidate({ candidates, recorded, previousSearch }) {
  if (!recorded) return undefined
  const byIdentity = candidates.find((candidate) =>
    candidate.pairRefs.join(',') === recorded.pairRefs.join(',') && candidate.scoreVector === recorded.scoreVector)
  if (byIdentity) return byIdentity
  const index = previousSearch?.winningIndex
  return Number.isInteger(index) ? candidates[index] : undefined
}

function buildSearchMetadata({ candidate, attempts, spaceSize }) {
  return {
    method: 'injected-scenarios',
    version: GATE_SEARCH_VERSION,
    winningIndex: candidate.index,
    winningPairRefs: candidate.pairRefs,
    winningScoreVector: candidate.scoreVector,
    attempts,
    spaceSize,
    attemptSpace: Math.min(spaceSize, GATE_SEARCH_LIMITS.maxAttempts),
    maxAttempts: GATE_SEARCH_LIMITS.maxAttempts,
    deadlineMinutes: GATE_SEARCH_LIMITS.deadlineMinutes,
    order: 'ref médio decrescente; desempate pela lista de refs',
    space: `6 pares entre os 9 primeiros pendentes por ref, sempre com o primeiro, × ${SCORE_PALETTE.length} vetores fixos de placar`,
    scoreSource: 'paleta fixa e sintética (SCORE_PALETTE) — nenhum placar de origem real',
    gateScenarios: GATE_SCENARIOS.map((scenario) => `${scenario.id}: ${scenario.test} (expect ${scenario.expect})`),
  }
}

function writeFixture({ baseCutoffUtc, targetDate, candidate, search }) {
  const bundle = buildFixtureBundle({ baseCutoffUtc, targetDate, pairs: candidate.pairs, search })
  mkdirSync(fixtureDir, { recursive: true })
  // Um corte novo muda a data do payload: payload antigo no diretório faria o
  // harness recusar a contagem. Remove só os que a nova fixture não referencia.
  const keep = new Set(bundle.files.map((file) => file.path))
  for (const file of readdirSync(fixtureDir)) {
    if (/^espn-scoreboard-\d{4}-\d{2}-\d{2}\.json$/.test(file) && !keep.has(file)) {
      rmSync(join(fixtureDir, file))
    }
  }
  writeFileSync(join(fixtureDir, 'README.md'), README)
  for (const file of bundle.files) writeFileSync(join(fixtureDir, file.path), file.content)
  return bundle
}

function printMatrix(attempts) {
  console.error('\nMatriz de tentativas (índice · pares · vetor · moveu · exit · segundos):')
  for (const attempt of attempts) {
    const moved = attempt.moved ? 'sim' : 'NÃO'
    const timeout = attempt.timedOut ? ' (timeout)' : ''
    console.error(`  #${String(attempt.index).padStart(2, '0')} · ${attempt.pairRefs.join(',')} · ${attempt.scoreVector} · ${moved} · exit ${attempt.exitCode} · ${attempt.seconds.toFixed(1)}s${timeout}`)
  }
}

function main() {
  const baseline = captureBaseline(root, DATA_PATHS)
  try {
    return search(baseline)
  } finally {
    disposeBaseline(baseline)
  }
}

/**
 * Busca o candidato. A árvore pode conter alterações legítimas de outra sessão:
 * `baseline` é a única fonte de restauração depois de cada tentativa.
 */
function search(baseline) {
  const dirty = dataTreeStatus()
  if (dirty !== '') console.log(`Baseline capturado com sujeira legítima preservada:\n${dirty}`)

  const schedule = loadCbfSchedule(srcDir)
  const existing = parsePackedResults(readFileSync(join(srcDir, 'currentSeasonResults.ts'), 'utf8'))
  const baseCutoffUtc = readCurrentCutoff(readFileSync(join(srcDir, 'sourceMetadata.ts'), 'utf8'))
  const targetDate = addUtcDays(baseCutoffUtc.slice(0, 10), 1)

  const candidates = enumerateGateCandidates({ schedule, existing })
  const spaceSize = gateCandidateSpaceSize({ schedule, existing })
  const previous = (() => {
    try {
      return readFixtureBundle(fixtureDir)
    } catch {
      // Fixture gerada antes de `baseCutoffUtc`: não é válida para o harness,
      // mas o registro da busca ainda permite reconferir o vencedor sem repetir
      // a busca inteira. A fixture nova substitui o manifest.
      try {
        const manifest = JSON.parse(readFileSync(join(fixtureDir, 'manifest.json'), 'utf8'))
        return { search: manifest.search ?? null, baseCutoffUtc: null }
      } catch {
        return null
      }
    }
  })()

  const attempts = []
  const record = (candidate, result) => {
    attempts.push({ index: candidate.index, pairRefs: candidate.pairRefs, scoreVector: candidate.scoreVector, ...result })
    console.log(`#${String(candidate.index).padStart(2, '0')} ${candidate.pairRefs.join(',')} · vetor ${candidate.scoreVector} · moveu=${result.moved ? 'sim' : 'não'} · exit=${result.exitCode} · ${result.seconds.toFixed(1)}s`)
  }

  // 1. Reconferência do vencedor registrado: uma execução, não a busca inteira.
  const recorded = recordedWinner(previous?.search)
  const recordedCandidate = reconfirmationCandidate({ candidates, recorded, previousSearch: previous?.search })

  if (recordedCandidate) {
    const result = runCandidate({ baseline, baseCutoffUtc, targetDate, pairs: recordedCandidate.pairs, expectedAdded: recordedCandidate.pairs.length })
    record(recordedCandidate, result)
    if (reproducesFailure(result)) {
      // Reaproveita a contagem de tentativas original: regenerar não pode mudar bytes.
      const search = buildSearchMetadata({ candidate: recordedCandidate, attempts: previous.search.attempts ?? attempts.length, spaceSize })
      writeFixture({ baseCutoffUtc, targetDate, candidate: recordedCandidate, search })
      console.log(`Fixture reconferida: ${targetDate} (corte ${baseCutoffUtc}) · vencedor #${recordedCandidate.index} ainda reproduz a falha do gate com recibo.`)
      return 0
    }
  }

  // 2. Primeiro candidato (ordem determinística) que move o pacote e falha no
  //    gate vermelho injetado. O cenário não depende do conteúdo dos pares, mas
  //    o harness exige que a fixture mova o pacote — isso a execução comprova.
  const deadline = Date.now() + GATE_SEARCH_LIMITS.deadlineMinutes * 60_000
  let winner = null
  for (const candidate of candidates) {
    if (recordedCandidate && candidate.index === recordedCandidate.index) continue
    if (attempts.length >= GATE_SEARCH_LIMITS.maxAttempts) {
      console.error(`\nBusca interrompida: limite de ${GATE_SEARCH_LIMITS.maxAttempts} tentativas atingido.`)
      break
    }
    if (Date.now() >= deadline) {
      console.error(`\nBusca interrompida: limite de ${GATE_SEARCH_LIMITS.deadlineMinutes} min atingido.`)
      break
    }
    const result = runCandidate({ baseline, baseCutoffUtc, targetDate, pairs: candidate.pairs, expectedAdded: candidate.pairs.length })
    record(candidate, result)
    if (reproducesFailure(result)) {
      winner = candidate
      break
    }
  }

  if (!winner) {
    console.error('fixture:gate abortado: nenhum candidato moveu o pacote e reproduziu a falha do gate vermelho injetado.')
    printMatrix(attempts)
    console.error('Não relaxe o critério nem edite a fixture à mão.')
    return 1
  }

  const search = buildSearchMetadata({ candidate: winner, attempts: attempts.length, spaceSize })
  const bundle = writeFixture({ baseCutoffUtc, targetDate, candidate: winner, search })
  console.log(`\nFixture ${targetDate} (corte ${baseCutoffUtc}) · ${bundle.pairs.length} pares sintéticos · vencedor #${winner.index} em ${attempts.length} tentativa(s)`)
  for (const pair of bundle.pairs) {
    console.log(`  ${pair.ref} (rodada ${pair.round}) ${pair.home} ${pair.homeGoals}–${pair.awayGoals} ${pair.away}`)
  }
  console.log(`Escrito em ${fixtureDir.replace(`${root}/`, '')}: README.md, ${bundle.files.map((file) => file.path).join(', ')}`)
  return 0
}

let code
try {
  code = main()
} catch (error) {
  console.error(`fixture:gate abortado: ${error.message}`)
  code = 1
}
process.exit(code)
