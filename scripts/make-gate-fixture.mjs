/**
 * Gera/regera a fixture `data/fixtures/gate-repro/` (npm run fixture:gate).
 *
 * A fixture move o pacote com 6 resultados sintéticos. Se o gate de 2 arquivos
 * ficar vermelho nos DOIS arquivos, ela reproduz o deadlock; se ficar verde com
 * o pacote movido, ela documenta o estado destravado. Como o efeito depende do
 * estado da tabela que os 6 resultados produzem, a escolha dos pares e dos
 * placares não é um literal copiado à mão: é uma **busca determinística e
 * limitada** (ver `enumerateGateCandidates`) que executa o gate para cada
 * candidato e prefere o primeiro que produz as duas falhas; sem nenhum, usa o
 * primeiro que move o pacote e deixa o gate verde.
 *
 * NENHUM placar tem origem real — a paleta é inventada e fixa. O manifest
 * registra método, índice vencedor e número de tentativas; não alega coleta.
 *
 * Determinismo: mesma árvore → mesmos bytes em `data/fixtures/gate-repro/`.
 * Quando o manifest já registra um vencedor, ele é reconferido com uma única
 * execução do gate (e o metadata anterior é reaproveitado byte a byte). Se o
 * calendário avançou e o conjunto não existe mais, o índice registrado é
 * reconferido no espaço atual.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCbfSchedule, readCurrentCutoff } from './lib/dataPipeline.mjs'
import {
  GATE_SEARCH_LIMITS,
  GATE_SEARCH_VERSION,
  GATE_TEST_COMMAND,
  GATE_TEST_FILES,
  SCORE_PALETTE,
  addUtcDays,
  buildFixtureBundle,
  buildScoreboardPayload,
  enumerateGateCandidates,
  failedGateTests,
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
  'data/source-snapshots',
  'docs/atualizacoes.md',
]

/** Teto por tentativa: um gate travado não pode consumir o orçamento inteiro. */
const ATTEMPT_TIMEOUT_MS = 180_000

const README = `# Fixture do gate (gate-repro)

## DADOS SINTÉTICOS — não são resultados reais

Este diretório **não** contém coleta de nenhuma fonte nem reconstrução de
placares reais. Os 6 pares e os placares foram **encontrados por busca
determinística** sobre partidas **pendentes** do calendário CBF 2026 e uma
paleta fixa de placares inventados (\`SCORE_PALETTE\` em
\`scripts/lib/gateFixture.mjs\`), no formato do scoreboard da ESPN.

O \`manifest.json\` registra a busca: \`search.winningIndex\`, o número de
tentativas (uma execução do gate de 2 arquivos por candidato), a ordem do
espaço e a paleta de placares. Nenhum campo alega origem real.

## Para que serve

O updater escreve o pacote e só depois roda os testes; enquanto dois testes de UI
dependeram do conteúdo do pacote, uma rodada real deixava a suíte vermelha e nada
era commitado. Esta fixture move o pacote, **offline e determinístico**, e o
\`manifest.json\` fixa \`baseCutoffUtc\` e \`targetDate\`: \`repro:gate\` não depende
do corte vivo do pacote.

\`\`\`bash
npm run fixture:gate   # regenera a fixture a partir do pacote atual
npm run repro:gate     # copia os payloads, roda o updater e restaura a árvore
\`\`\`

\`fixture:gate\` reconfere o vencedor registrado com uma única execução do gate;
se o calendário avançou e o conjunto não existe mais, reconfere o candidato de
mesmo índice no espaço atual. Prefere uma fixture que deixe os 2 testes
vermelhos; se o gate estiver verde com o pacote movido, grava o estado
destravado. Com a fixture já no corte atual e o gate verde, a pasta fica intacta.

\`repro:gate\` restaura os caminhos de dados no \`finally\`, então os payloads daqui
nunca ficam em \`data/source-snapshots/\`. Nenhum arquivo de \`src/**\` pode importar
deste diretório (há teste vigiando).

## Arquivos

- \`espn-scoreboard-<data>.json\` — payload sintético; \`<data>\` é o dia do corte + 1.
- \`expected.json\` — os pares que o updater deve incorporar (\`added\`, \`newResults\`).
- \`manifest.json\` — sha256 de cada payload e do expected, \`baseCutoffUtc\` (corte
  a partir do qual a fixture foi gerada), \`targetDate\` (= corte + 1 dia),
  \`expectedFailures\` e o registro da busca; o harness recusa hash divergente.

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

function restoreDataPaths(createdSnapshot) {
  if (createdSnapshot && existsSync(createdSnapshot)) rmSync(createdSnapshot)
  const checkout = git(['checkout', '--', ...DATA_PATHS])
  if (checkout.status !== 0) throw new Error(`git checkout dos caminhos de dados falhou:\n${checkout.stderr}`)
  const dirty = dataTreeStatus()
  if (dirty !== '') throw new Error(`caminhos de dados continuam sujos após a restauração:\n${dirty}`)
}

/** Arquivos do gate que apareceram vermelhos na saída do vitest. */
function failedTestFiles(output) {
  return failedGateTests(output)
}

/** Um candidato = uma execução real do updater + gate de 2 arquivos. */
function runCandidate({ baseCutoffUtc, targetDate, pairs, expectedAdded }) {
  const payloadName = `espn-scoreboard-${targetDate}.json`
  const destination = join(snapshotsDir, payloadName)
  if (existsSync(destination)) throw new Error(`${payloadName} já existe em data/source-snapshots/ (caminho sujo).`)

  const started = Date.now()
  let output = ''
  let timedOut = false
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
        `--test=${GATE_TEST_COMMAND}`,
      ],
      { cwd: root, encoding: 'utf8', timeout: ATTEMPT_TIMEOUT_MS },
    )
    output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
    timedOut = run.error?.code === 'ETIMEDOUT' || run.signal === 'SIGTERM'
  } finally {
    restoreDataPaths(destination)
  }

  const moved = output.split('\n').some((line) => line.startsWith(`Novos efetivos: ${expectedAdded}`))
  return { moved, timedOut, failures: failedTestFiles(output), seconds: (Date.now() - started) / 1000 }
}

function reproducesDeadlock(result) {
  return result.moved && GATE_TEST_FILES.every((file) => result.failures.has(file))
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
    method: 'deterministic-bounded',
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
    gateCommand: GATE_TEST_COMMAND,
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
  console.error('\nMatriz de tentativas (índice · pares · vetor · moveu · falhas · segundos):')
  for (const attempt of attempts) {
    const failures = [...attempt.failures].map((file) => file.replace('src/', '').replace('.test.tsx', '')).join('+') || 'nenhuma'
    const moved = attempt.moved ? 'sim' : 'NÃO'
    const timeout = attempt.timedOut ? ' (timeout)' : ''
    console.error(`  #${String(attempt.index).padStart(2, '0')} · ${attempt.pairRefs.join(',')} · ${attempt.scoreVector} · ${moved} · ${failures} · ${attempt.seconds.toFixed(1)}s${timeout}`)
  }
}

function main() {
  const dirty = dataTreeStatus()
  if (dirty !== '') {
    console.error('fixture:gate abortado: caminhos de dados já estão sujos antes da busca.')
    console.error(dirty)
    console.error('Restaure-os (git checkout -- <caminho>) e rode de novo.')
    return 2
  }

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
    const failures = [...result.failures].map((file) => file.replace('src/', '')).join(' + ') || 'nenhuma'
    console.log(`#${String(candidate.index).padStart(2, '0')} ${candidate.pairRefs.join(',')} · vetor ${candidate.scoreVector} · moveu=${result.moved ? 'sim' : 'não'} · falhas=${failures} · ${result.seconds.toFixed(1)}s`)
  }

  // 1. Reconferência do vencedor registrado: uma execução, não a busca inteira.
  const recorded = recordedWinner(previous?.search)
  const recordedCandidate = reconfirmationCandidate({ candidates, recorded, previousSearch: previous?.search })

  if (recordedCandidate) {
    const result = runCandidate({ baseCutoffUtc, targetDate, pairs: recordedCandidate.pairs, expectedAdded: recordedCandidate.pairs.length })
    record(recordedCandidate, result)
    if (reproducesDeadlock(result)) {
      // Reaproveita a contagem de tentativas original: regenerar não pode mudar bytes.
      const search = buildSearchMetadata({ candidate: recordedCandidate, attempts: previous.search.attempts ?? attempts.length, spaceSize })
      writeFixture({ baseCutoffUtc, targetDate, candidate: recordedCandidate, search })
      console.log(`Fixture reconferida: ${targetDate} (corte ${baseCutoffUtc}) · vencedor #${recordedCandidate.index} ainda deixa as duas falhas.`)
      return 0
    }
    if (result.moved && result.failures.size === 0) {
      if (previous.baseCutoffUtc !== baseCutoffUtc) {
        // Fixture de um corte anterior e gate já verde: atualiza o manifest para
        // que o harness reproduza sem consultar o pacote vivo.
        const search = buildSearchMetadata({ candidate: recordedCandidate, attempts: previous.search.attempts ?? attempts.length, spaceSize })
        writeFixture({ baseCutoffUtc, targetDate, candidate: recordedCandidate, search })
        console.log(`Gate verde — fixture atualizada para o corte ${baseCutoffUtc} (${targetDate}).`)
      } else {
        console.log('Gate verde com a fixture registrada — deadlock destravado; nada a regenerar.')
      }
      return 0
    }
  }

  // 2. Busca completa, limitada por tentativas e por tempo total.
  //    Preferência: candidato que reproduz as duas falhas (fixture de regressão).
  //    Se o gate está verde com o pacote movido, guarda o primeiro como fixture
  //    do estado destravado — o harness precisa que o pacote se mova.
  const deadline = Date.now() + GATE_SEARCH_LIMITS.deadlineMinutes * 60_000
  let winner = null
  let greenFallback = null
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
    const result = runCandidate({ baseCutoffUtc, targetDate, pairs: candidate.pairs, expectedAdded: candidate.pairs.length })
    record(candidate, result)
    if (reproducesDeadlock(result)) {
      winner = candidate
      break
    }
    if (!greenFallback && result.moved && result.failures.size === 0) {
      greenFallback = candidate
    }
  }

  if (!winner) winner = greenFallback
  if (!winner) {
    console.error(`fixture:gate abortado: nenhum candidato moveu o pacote e deixou os ${GATE_TEST_FILES.length} testes do gate vermelhos ou verdes.`)
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
