/**
 * Fixture sintética do updater.
 *
 * A fixture move o pacote com resultados inventados de partidas **pendentes**
 * do calendário CBF 2026, no formato do scoreboard da ESPN, de modo que o
 * updater (rodado com `--offline --no-commit`) os incorpore como resultados
 * novos.
 *
 * O gate não tem mais acoplamento com testes de UI: `GATE_SCENARIOS` declara
 * dois comandos injetados por `--test` — um vermelho e um verde — e o harness
 * `repro:gate` prova os dois lados (falha com recibo + sucesso sem recibo).
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

/**
 * Código de saída exclusivo do harness para fixture que não move mais o pacote.
 * Fica fora de 0–5 (`repro-update-gate.mjs`) para que o diagnóstico não se
 * confunda com falha de contrato (5) nem com fixture inválida (3).
 */
export const FIXTURE_STALE_EXIT_CODE = 6

/**
 * Classifica o movimento do pacote medido no stdout do updater contra o
 * `added` declarado pela fixture.
 *
 * A fixture é gerada sobre partidas pendentes; quando o pacote avança, parte
 * dos pares pode ser deduplicada pelo updater. Por isso a igualdade exata não
 * é contrato — o contrato é: o pacote avança (`measured >= 1`) e nunca mais
 * que o previsto (`measured <= expected`).
 *
 * - `ok`: `1 <= measured <= expected`;
 * - `stale`: `measured === 0` — a fixture precisa ser regenerada;
 * - `overshoot`: `measured > expected` — o manifest subestima os pares;
 * - `unreported`: o updater não imprimiu `Novos efetivos:` — nada foi provado.
 */
export function classifyFixtureMovement({ measured, expected }) {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new Error(`expected inválido: ${expected} (a fixture precisa declarar ao menos 1 par)`)
  }
  if (measured == null) return { status: 'unreported', measured: null, expected }
  if (!Number.isInteger(measured) || measured < 0) {
    throw new Error(`measured inválido: ${measured}`)
  }
  if (measured === 0) return { status: 'stale', measured, expected }
  if (measured > expected) return { status: 'overshoot', measured, expected }
  return { status: 'ok', measured, expected }
}

/**
 * Cenários do gate, injetados por `--test`.
 *
 * O gate deixou de depender de arquivos de teste de UI (que envelheciam junto
 * com o pacote). Cada cenário declara um comando e o resultado exigido:
 * `fail` = o updater deve abortar depois de escrever; `pass` = deve concluir.
 */
export const GATE_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'red', test: 'node -e "process.exit(1)"', expect: 'fail' }),
  Object.freeze({ id: 'green', test: 'node -e "process.exit(0)"', expect: 'pass' }),
])

export const GATE_SCENARIO_EXPECTATIONS = Object.freeze(['fail', 'pass'])

/** Valida e normaliza os cenários; exige ao menos um vermelho e um verde. */
export function validateGateScenarios(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('Gate sem cenários: informe ao menos um cenário { id, test, expect }.')
  }

  const ids = new Set()
  const normalized = scenarios.map((scenario) => {
    if (scenario == null || typeof scenario !== 'object') {
      throw new Error(`Cenário de gate inválido: ${JSON.stringify(scenario)}`)
    }
    const { id, test, expect: expectation } = scenario
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new Error(`Cenário de gate com id inválido: ${JSON.stringify(id)}`)
    }
    if (ids.has(id)) throw new Error(`Cenário de gate duplicado: ${id}`)
    ids.add(id)
    if (typeof test !== 'string' || test.trim() === '') {
      throw new Error(`Cenário de gate "${id}" sem comando de teste.`)
    }
    if (!GATE_SCENARIO_EXPECTATIONS.includes(expectation)) {
      throw new Error(`Cenário de gate "${id}" com expect inválido: ${JSON.stringify(expectation)}`)
    }
    return { id, test, expect: expectation }
  })

  for (const expectation of GATE_SCENARIO_EXPECTATIONS) {
    if (!normalized.some((scenario) => scenario.expect === expectation)) {
      throw new Error(`Gate exige ao menos um cenário "${expectation}" (vermelho e verde).`)
    }
  }

  return normalized
}

/** Limites da busca que escolhe a fixture (tentativas = execuções do updater). */
export const GATE_SEARCH_LIMITS = Object.freeze({ maxAttempts: 40, deadlineMinutes: 15 })

/**
 * Versão do algoritmo da fixture. Entra no manifest: se espaço, ordem, paleta
 * ou contrato do gate mudarem, o vencedor registrado deixa de ser reaproveitado
 * e a fixture é regenerada.
 */
export const GATE_SEARCH_VERSION = 2

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
 * Espaço de candidatos da fixture, determinístico e finito.
 *
 * Os conjuntos saem dos `count + 3` primeiros pendentes por `ref`, **sempre com
 * o primeiro** — o confronto de menor `ref` âncora a fixture. Cada conjunto
 * recebe, por posição, um vetor fixo de `SCORE_PALETTE`.
 *
 * Ordem: `ref` médio decrescente, desempate pela lista de refs. A ordem é
 * declarada para que o primeiro candidato (vencedor no contrato de cenários
 * injetados) seja o mesmo em qualquer máquina.
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
export function buildFixtureBundle({ schedule, existing, count = DEFAULT_PAIR_COUNT, baseCutoffUtc, targetDate, pairs, search, scenarios = GATE_SCENARIOS }) {
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
  const resolvedScenarios = validateGateScenarios(scenarios)
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
    scenarios: resolvedScenarios,
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

  let scenarios
  try {
    scenarios = validateGateScenarios(manifest.scenarios)
  } catch (error) {
    throw new Error(`manifest sem scenarios válidos (${error.message}); rode \`npm run fixture:gate\` para regenerar a fixture`)
  }

  return {
    baseCutoffUtc: manifest.baseCutoffUtc,
    targetDate: manifest.targetDate,
    added: manifest.added,
    payloads,
    expected,
    scenarios,
    search: manifest.search ?? null,
  }
}

/** Payloads de scoreboard presentes numa pasta (ordem estável). */
export function listScoreboardPayloads(directory) {
  return readdirSync(directory)
    .filter((file) => SCOREBOARD_FILE.test(file))
    .sort()
}
