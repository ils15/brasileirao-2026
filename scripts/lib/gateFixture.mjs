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

export const FIXTURE_ID = 'gate-repro'
export const FIXTURE_KIND = 'synthetic'
export const DEFAULT_PAIR_COUNT = 6

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
 * Os `count` primeiros pares pendentes em ordem de `ref` do calendário CBF.
 * "Pendente" = par ordenado (casa, fora) ausente dos resultados empacotados.
 */
export function pickSyntheticPairs({ schedule, existing, count = DEFAULT_PAIR_COUNT }) {
  if (!Array.isArray(schedule) || schedule.length === 0) throw new Error('pickSyntheticPairs exige um calendário não vazio')
  if (!Array.isArray(existing)) throw new Error('pickSyntheticPairs exige os resultados empacotados')
  if (!Number.isInteger(count) || count < 1) throw new Error(`Contagem inválida de pares: ${count}`)

  const played = new Set(existing.map((match) => `${match.home}:${match.away}`))
  const pending = schedule
    .filter((fixture) => !played.has(`${fixture.home}:${fixture.away}`))
    .sort((left, right) => left.ref.localeCompare(right.ref))

  if (pending.length < count) {
    throw new Error(`Calendário tem ${pending.length} pendentes; a fixture exige ${count}.`)
  }

  return pending.slice(0, count).map((fixture, index) => ({ ...fixture, ...syntheticScoreFor(index) }))
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
 */
export function buildFixtureBundle({ schedule, existing, count = DEFAULT_PAIR_COUNT, targetDate }) {
  if (!ISO_DATE.test(targetDate)) throw new Error(`targetDate inválido: ${targetDate}`)
  const pairs = pickSyntheticPairs({ schedule, existing, count })
  const payloadName = `espn-scoreboard-${targetDate}.json`

  const payload = buildScoreboardPayload({ targetDate, pairs })
  const payloadContent = serializeJson(payload)

  const expectedContent = serializeJson({
    targetDate,
    added: pairs.length,
    newResults: pairs.map((pair) => ({
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
    targetDate,
    added: pairs.length,
    payloads: [{ path: payloadName, sha256: sha256(payloadContent) }],
    expected: { path: 'expected.json', sha256: sha256(expectedContent) },
  })

  return {
    targetDate,
    pairs,
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

  return { targetDate: manifest.targetDate, added: manifest.added, payloads, expected }
}

/** Payloads de scoreboard presentes numa pasta (ordem estável). */
export function listScoreboardPayloads(directory) {
  return readdirSync(directory)
    .filter((file) => SCOREBOARD_FILE.test(file))
    .sort()
}
