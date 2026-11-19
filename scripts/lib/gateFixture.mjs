/**
 * Fixture sintética que reproduz o deadlock do updater.
 *
 * O objetivo é mover o pacote de dados para o estado em que dois testes de UI
 * dependem do conteúdo do pacote (ver `.pantheon/deepwork/unblock-data-automation`).
 * Para isso a fixture inventa resultados de partidas **pendentes** do calendário
 * CBF 2026, no formato do scoreboard da ESPN, de modo que o updater (rodado com
 * `--offline --no-commit`) os incorpore como resultados novos.
 *
 * DADOS SINTÉTICOS: nada aqui vem de coleta real. Nenhum caminho de `src/**`
 * pode importar de `data/fixtures/**` — o teste irmão vigia isso.
 *
 * Funções puras: recebem o calendário e os resultados empacotados já parseados.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESPN_NAME_SLUGS } from './dataPipeline.mjs'
import { isIsoInstant } from './updateArgs.mjs'

export const FIXTURE_ID = 'gate-repro'
export const FIXTURE_KIND = 'synthetic'
export const DEFAULT_PAIR_COUNT = 6

/** Arquivos do gate estreito: o harness só aceita a fixture se os dois ficarem vermelhos. */
export const GATE_TEST_FILES = Object.freeze(['src/ProjectionSection.test.tsx', 'src/MatchSimulator.test.tsx'])
export const GATE_TEST_COMMAND = `npx vitest run ${GATE_TEST_FILES.join(' ')}`

/** Limites da busca que escolhe a fixture (tentativas = execuções do gate). */
export const GATE_SEARCH_LIMITS = Object.freeze({ maxAttempts: 40, deadlineMinutes: 15 })

/**
 * Versão do algoritmo de busca. Entra no manifest: se espaço, ordem ou paleta
 * mudarem, o vencedor registrado deixa de ser reaproveitado e a busca roda de novo.
 */
export const GATE_SEARCH_VERSION = 1

/** Pendentes extras além dos 6 jogados: janela de onde os conjuntos são combinados. */
const SEARCH_WINDOW_EXTRA = 3

/**
 * Paleta FIXA de placares da busca. Nenhum placar aqui tem origem real: são
 * resultados plausíveis inventados, gravados como literal para que a busca seja
 * determinística. O vetor é aplicado por posição dentro do conjunto de 6 pares.
 */
export const SCORE_PALETTE = Object.freeze([
  Object.freeze({ id: 'A', scores: Object.freeze([[2, 1], [4, 0], [2, 1], [0, 0], [0, 1], [2, 0]]) }),
  Object.freeze({ id: 'B', scores: Object.freeze([[1, 0], [2, 1], [1, 1], [3, 0], [0, 0], [1, 2]]) }),
])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SCOREBOARD_FILE = /^espn-scoreboard-\d{4}-\d{2}-\d{2}\.json$/
const SCOREBOARD_SCHEMA_VERSION = 1

const ESPN_DISPLAY_NAME_BY_SLUG = new Map(
  Object.entries(ESPN_NAME_SLUGS).map(([displayName, slug]) => [slug, displayName]),
)

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/** `AAAA-MM-DD` + n dias (UTC), usado para derivar o dia da coleta a partir do corte. */
export function addUtcDays(isoDate, days) {
  if (!ISO_DATE.test(isoDate)) throw new Error(`Data inválida em addUtcDays: ${isoDate}`)
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function espnDisplayNameFor(slug) {
  const displayName = ESPN_DISPLAY_NAME_BY_SLUG.get(slug)
  if (!displayName) {
    throw new Error(`Slug sem displayName conhecido pela ESPN: "${slug}". Atualize ESPN_NAME_SLUGS.`)
  }
  return displayName
}

/**
 * Placar sintético determinístico, função só do índice na seleção.
 * `index % 3` / `(index + 1) % 2` produz 0x1, 1x0, 2x1, 0x0, 1x1, 2x0 — mistura
 * vitória da casa, empate e vitória do visitante para mexer na classificação.
 */
export function syntheticScoreFor(index) {
  if (!Number.isInteger(index) || index < 0) throw new Error(`Índice inválido para placar sintético: ${index}`)
  return { homeGoals: index % 3, awayGoals: (index + 1) % 2 }
}

/**
 * Pares pendentes em ordem de `ref`: o par ordenado (casa, fora) está fora dos
 * resultados empacotados.
 */
export function pendingFixtures({ schedule, existing }) {
  if (!Array.isArray(schedule) || schedule.length === 0) throw new Error('pendingFixtures exige um calendário não vazio')
  if (!Array.isArray(existing)) throw new Error('pendingFixtures exige os resultados empacotados')
  const played = new Set(existing.map((match) => `${match.home}:${match.away}`))
  return schedule
    .filter((fixture) => !played.has(`${fixture.home}:${fixture.away}`))
    .sort((left, right) => left.ref.localeCompare(right.ref))
}

/**
 * Os `count` primeiros pares pendentes em ordem de `ref` do calendário CBF.
 * "Pendente" = par ordenado (casa, fora) ausente dos resultados empacotados.
 */
export function pickSyntheticPairs({ schedule, existing, count = DEFAULT_PAIR_COUNT }) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`Contagem inválida de pares: ${count}`)

  const pending = pendingFixtures({ schedule, existing })
  if (pending.length < count) {
    throw new Error(`Calendário tem ${pending.length} pendentes; a fixture exige ${count}.`)
  }

  return pending.slice(0, count).map((fixture, index) => ({ ...fixture, ...syntheticScoreFor(index) }))
}

/** Combinações de `size` itens, em ordem lexicográfica da entrada. */
function combinations(items, size) {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [head, ...tail] = items
  return [
    ...combinations(tail, size - 1).map((rest) => [head, ...rest]),
    ...combinations(tail, size),
  ]
}

function meanRef(fixtures) {
  return fixtures.reduce((total, fixture) => total + Number.parseInt(fixture.ref, 10), 0) / fixtures.length
}

function compareRefLists(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = left[index].ref.localeCompare(right[index].ref)
    if (order !== 0) return order
  }
  return left.length - right.length
}

/**
 * Espaço de busca da fixture, determinístico e finito.
 *
 * Os conjuntos saem dos `count + 3` primeiros pendentes por `ref`, **sempre com
 * o primeiro** (é o confronto que o simulador renderiza por padrão; tirá-lo é o
 * que deixa o teste do simulador vermelho). Cada conjunto recebe, por posição,
 * um vetor fixo de `SCORE_PALETTE`.
 *
 * Ordem: `ref` médio decrescente — os conjuntos que incluem os confrontos do fim
 * da rodada vêm primeiro, porque a falha do painel de projeções aparece na faixa
 * de pontuação dos clubes de tabela mais baixa. É heurística declarada, não
 * afirmação de otimalidade; o resultado é o mesmo em qualquer máquina.
 */
export function enumerateGateCandidates({ schedule, existing, count = DEFAULT_PAIR_COUNT, maxAttempts = GATE_SEARCH_LIMITS.maxAttempts }) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error(`Limite de tentativas inválido: ${maxAttempts}`)

  const pending = pendingFixtures({ schedule, existing })
  const window = pending.slice(0, count + SEARCH_WINDOW_EXTRA)
  if (window.length < count) {
    throw new Error(`Calendário tem ${pending.length} pendentes; a busca exige ao menos ${count}.`)
  }

  const [anchor, ...rest] = window
  const sets = combinations(rest, count - 1)
    .map((subset) => [anchor, ...subset].sort((left, right) => left.ref.localeCompare(right.ref)))
    .sort((left, right) => meanRef(right) - meanRef(left) || compareRefLists(left, right))

  const candidates = []
  for (const set of sets) {
    for (const palette of SCORE_PALETTE) {
      candidates.push({
        index: candidates.length,
        pairRefs: set.map((fixture) => fixture.ref),
        scoreVector: palette.id,
        pairs: set.map((fixture, position) => ({
          ...fixture,
          homeGoals: palette.scores[position][0],
          awayGoals: palette.scores[position][1],
        })),
      })
    }
  }

  return candidates.slice(0, maxAttempts)
}

/**
 * Tamanho do espaço completo de candidatos (antes do corte por tentativas).
 * O manifest registra os dois números para não sugerir que a busca foi exaustiva.
 */
export function gateCandidateSpaceSize({ schedule, existing, count = DEFAULT_PAIR_COUNT }) {
  const pending = pendingFixtures({ schedule, existing })
  const window = pending.slice(0, count + SEARCH_WINDOW_EXTRA)
  if (window.length < count) {
    throw new Error(`Calendário tem ${pending.length} pendentes; a busca exige ao menos ${count}.`)
  }
  return combinations(window.slice(1), count - 1).length * SCORE_PALETTE.length
}

/** Instante UTC do kickoff sintético: 18h..23h do dia da coleta (≤ 23:59:59Z). */
export function kickoffFor(targetDate, index) {
  if (!ISO_DATE.test(targetDate)) throw new Error(`Dia inválido para a fixture: ${targetDate}`)
  const hour = 18 + index
  if (hour > 23) throw new Error(`Fixture com ${index + 1} jogos passaria da meia-noite de ${targetDate}`)
  return `${targetDate}T${String(hour).padStart(2, '0')}:00:00Z`
}

/** Scoreboard no subconjunto do formato ESPN que `parseEspnScoreboard` lê. */
export function buildScoreboardPayload({ targetDate, pairs }) {
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('buildScoreboardPayload exige pares sintéticos')
  return {
    // Marca explícita de dado inventado: sobrevive a quem abrir o JSON.
    _fixture: { id: FIXTURE_ID, kind: FIXTURE_KIND, warning: 'DADOS SINTÉTICOS — não é coleta da ESPN' },
    schemaVersion: SCOREBOARD_SCHEMA_VERSION,
    events: pairs.map((pair, index) => {
      const home = espnDisplayNameFor(pair.home)
      const away = espnDisplayNameFor(pair.away)
      return {
        id: `gate-${pair.ref}`,
        date: kickoffFor(targetDate, index),
        name: `${home} at ${away}`,
        status: { type: { state: 'post', completed: true, detail: 'FT', shortDetail: 'FT' } },
        competitions: [
          {
            competitors: [
              { homeAway: 'home', winner: pair.homeGoals > pair.awayGoals, score: String(pair.homeGoals), team: { displayName: home } },
              { homeAway: 'away', winner: pair.awayGoals > pair.homeGoals, score: String(pair.awayGoals), team: { displayName: away } },
            ],
          },
        ],
      }
    }),
  }
}

/** JSON determinístico: mesma entrada → mesmos bytes (sem carimbo de tempo). */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Resultados empacotados (`src/currentSeasonResults.ts`) — mesma linha que o updater lê. */
export function parsePackedResults(source) {
  return source
    .split('\n')
    .filter((line) => line.trim().startsWith('{ home:'))
    .map((line) => {
      const match = line.match(/home: "([^"]+)", away: "([^"]+)", homeGoals: (\d+), awayGoals: (\d+), kickoff: "([^"]+)", source: "([^"]+)", sourceRef: "([^"]+)"/)
      if (!match) throw new Error(`Linha de resultado não parseável no pacote: ${line}`)
      return { home: match[1], away: match[2], homeGoals: Number(match[3]), awayGoals: Number(match[4]), kickoff: match[5], source: match[6], sourceRef: match[7] }
    })
}

/**
 * Conteúdo completo da fixture (payload + expected + manifest com sha256).
 * Devolve `files` em ordem estável para escrita determinística no disco.
 *
 * `baseCutoffUtc` é o corte do pacote a partir do qual a fixture foi gerada.
 * `targetDate` é sempre o dia seguinte ao corte: é a data que o harness passa
 * como `--today` junto de `--cutoff=baseCutoffUtc`, sem consultar o pacote vivo.
 */
export function buildFixtureBundle({ schedule, existing, count = DEFAULT_PAIR_COUNT, baseCutoffUtc, targetDate, pairs, search }) {
  if (!isIsoInstant(baseCutoffUtc)) {
    throw new Error(`baseCutoffUtc inválido: ${baseCutoffUtc} (esperado AAAA-MM-DDTHH:MM:SSZ)`)
  }
  const derivedTargetDate = addUtcDays(baseCutoffUtc.slice(0, 10), 1)
  const resolvedTargetDate = targetDate ?? derivedTargetDate
  if (resolvedTargetDate !== derivedTargetDate) {
    throw new Error(`targetDate ${resolvedTargetDate} difere de baseCutoffUtc + 1 dia (${derivedTargetDate})`)
  }
  const resolvedPairs = pairs ?? pickSyntheticPairs({ schedule, existing, count })
  if (!Array.isArray(resolvedPairs) || resolvedPairs.length !== count) {
    throw new Error(`A fixture exige ${count} pares; recebeu ${Array.isArray(resolvedPairs) ? resolvedPairs.length : 'nada'}.`)
  }
  const payloadName = `espn-scoreboard-${resolvedTargetDate}.json`

  const payload = buildScoreboardPayload({ targetDate: resolvedTargetDate, pairs: resolvedPairs })
  const payloadContent = serializeJson(payload)

  const expectedContent = serializeJson({
    targetDate: resolvedTargetDate,
    added: resolvedPairs.length,
    newResults: resolvedPairs.map((pair) => ({
      ref: pair.ref,
      round: pair.round,
      home: pair.home,
      away: pair.away,
      homeGoals: pair.homeGoals,
      awayGoals: pair.awayGoals,
    })),
  })

  const manifestContent = serializeJson({
    fixture: FIXTURE_ID,
    kind: FIXTURE_KIND,
    warning: 'DADOS SINTÉTICOS — não é coleta real; ver README.md desta pasta',
    baseCutoffUtc,
    targetDate: resolvedTargetDate,
    added: resolvedPairs.length,
    payloads: [{ path: payloadName, sha256: sha256(payloadContent) }],
    expected: { path: 'expected.json', sha256: sha256(expectedContent) },
    expectedFailures: [...GATE_TEST_FILES],
    ...(search ? { search } : {}),
  })

  return {
    targetDate: resolvedTargetDate,
    baseCutoffUtc,
    pairs: resolvedPairs,
    files: [
      { path: payloadName, content: payloadContent },
      { path: 'expected.json', content: expectedContent },
      { path: 'manifest.json', content: manifestContent },
    ],
  }
}

/**
 * Lê a fixture do disco e confere cada sha256 do manifest.
 * Qualquer divergência aborta: reprodução que "conserta" sozinha mente.
 */
export function readFixtureBundle(directory) {
  const manifestPath = join(directory, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  if (manifest.fixture !== FIXTURE_ID || manifest.kind !== FIXTURE_KIND) {
    throw new Error(`Manifest de fixture inesperado em ${manifestPath}: ${JSON.stringify({ fixture: manifest.fixture, kind: manifest.kind })}`)
  }
  if (!ISO_DATE.test(manifest.targetDate ?? '')) {
    throw new Error(`targetDate inválido no manifest: ${manifest.targetDate}`)
  }
  if (!isIsoInstant(manifest.baseCutoffUtc)) {
    throw new Error(`manifest sem baseCutoffUtc válido (${JSON.stringify(manifest.baseCutoffUtc)}); rode \`npm run fixture:gate\` para regenerar a fixture`)
  }
  const expectedTargetDate = addUtcDays(manifest.baseCutoffUtc.slice(0, 10), 1)
  if (manifest.targetDate !== expectedTargetDate) {
    throw new Error(`targetDate ${manifest.targetDate} não é o dia seguinte ao baseCutoffUtc ${manifest.baseCutoffUtc} (${expectedTargetDate}); rode \`npm run fixture:gate\``)
  }
  if (!Number.isInteger(manifest.added) || manifest.added < 1) {
    throw new Error(`added inválido no manifest: ${manifest.added}`)
  }

  const payloads = (manifest.payloads ?? []).map((entry) => {
    if (!SCOREBOARD_FILE.test(entry.path)) {
      throw new Error(`Payload de fixture fora do padrão espn-scoreboard-AAAA-MM-DD.json: ${entry.path}`)
    }
    const content = readFileSync(join(directory, entry.path), 'utf8')
    const digest = sha256(content)
    if (digest !== entry.sha256) {
      throw new Error(`sha256 divergente para ${entry.path}: manifest ${entry.sha256}, arquivo ${digest}`)
    }
    return { path: entry.path, content }
  })
  if (payloads.length === 0) throw new Error(`Manifest sem payloads: ${manifestPath}`)

  const expectedPath = manifest.expected?.path ?? 'expected.json'
  const expectedContent = readFileSync(join(directory, expectedPath), 'utf8')
  if (sha256(expectedContent) !== manifest.expected?.sha256) {
    throw new Error(`sha256 divergente para ${expectedPath} na fixture`)
  }
  const expected = JSON.parse(expectedContent)
  if (expected.added !== manifest.added) {
    throw new Error(`expected.added (${expected.added}) difere de manifest.added (${manifest.added})`)
  }

  const expectedFailures = manifest.expectedFailures ?? [...GATE_TEST_FILES]
  if (!Array.isArray(expectedFailures) || expectedFailures.length === 0) {
    throw new Error(`expectedFailures inválido no manifest: ${JSON.stringify(manifest.expectedFailures)}`)
  }
  for (const file of expectedFailures) {
    if (typeof file !== 'string' || !/^src\/[\w./-]+\.test\.tsx?$/.test(file)) {
      throw new Error(`expectedFailures aponta caminho fora de src/**: ${file}`)
    }
  }

  return {
    baseCutoffUtc: manifest.baseCutoffUtc,
    targetDate: manifest.targetDate,
    added: manifest.added,
    payloads,
    expected,
    expectedFailures,
    search: manifest.search ?? null,
  }
}

/** Payloads de scoreboard presentes numa pasta (ordem estável). */
export function listScoreboardPayloads(directory) {
  return readdirSync(directory)
    .filter((file) => SCOREBOARD_FILE.test(file))
    .sort()
}

/** Arquivos do gate que apareceram vermelhos na saída do vitest. */
export function failedGateTests(output, files = GATE_TEST_FILES) {
  const failures = new Set()
  for (const file of files) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`FAIL\\s+${escaped}`).test(output) || new RegExp(`❯\\s+${escaped}\\s+\\([^)]*failed`).test(output)) {
      failures.add(file)
    }
  }
  return failures
}
