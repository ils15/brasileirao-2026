#!/usr/bin/env node
/**
 * Alarme de defasagem do pacote de dados versionado — independente de push.
 *
 * O alarme do Pages (`check-deploy-freshness.mjs`) só roda depois de um deploy;
 * quando o updater parou de empurrar, ele nunca executou e a defasagem ficou
 * dias em silêncio. Este script olha apenas para `ANALYTICAL_CUTOFF_UTC` em
 * `src/sourceMetadata.ts` e para o relógio: sem rede, sem dependências, sem
 * `npm ci` — roda num workflow agendado e fala por anotações do Actions.
 *
 * Uso:
 *   node scripts/check-data-freshness.mjs
 *   node scripts/check-data-freshness.mjs --max-age-hours=24
 *   node scripts/check-data-freshness.mjs --now=2026-11-25T00:00:00Z
 *   node scripts/check-data-freshness.mjs --cutoff=2026-11-19T13:05:52Z
 *   node scripts/check-data-freshness.mjs --now=2026-11-29T13:05:52Z
 *   node scripts/check-data-freshness.mjs --ignore-calendar
 *   node scripts/check-data-freshness.mjs --snapshots-dir=/tmp/fixture
 *
 * Idade sozinha não distingue "não houve jogo" de "o resultado se perdeu". Em
 * idade acima do limite, o alarme consulta os snapshots `espn-scoreboard-*.json`
 * e só reprova se houver partida **encerrada** com kickoff entre o corte e
 * `agora - 6h` — resultado que já deveria estar publicado. Sem esse jogo, o
 * corte pode ter parado por entressafra/parada e o run termina 0 com um
 * `::notice::` (o que também fecha a issue). `--ignore-calendar` desliga a
 * consulta e restaura a decisão só por idade; sem snapshot legível o alarme
 * também volta ao modo ruidoso e avisa com `::warning::`.
 *
 * Saída: `::notice::` quando fresco, `::error::` quando defasado. Códigos:
 * 0 = fresco, 1 = defasado, 2 = erro de parsing (corte ausente/inválido, flag
 * inválida). Nunca confunde "não consegui ler" com "está fresco".
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  completedKickoffsFromScoreboard,
  DEFAULT_GRACE_HOURS,
  expectedResultPending,
  isStale,
  stalenessHours,
} from './lib/freshness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const METADATA_PATH = join(ROOT, 'src/sourceMetadata.ts')
const SNAPSHOTS_DIR = join(ROOT, 'data/source-snapshots')
const SCOREBOARD_FILE_RE = /^espn-scoreboard-\d{4}-\d{2}-\d{2}\.json$/
const DEFAULT_MAX_AGE_HOURS = 24

const EXIT_FRESH = 0
const EXIT_STALE = 1
const EXIT_PARSE_ERROR = 2

/** Anotação do GitHub Actions, com escape obrigatório de `%`, CR e LF. */
function annotate(level, message) {
  const escaped = String(message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  console.log(`::${level}::${escaped}`)
}

/** Valor de uma flag só na forma `--nome=valor`; `undefined` se ausente. */
function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(prefix))
  if (found == null) return undefined
  if (found === `--${name}`) throw new Error(`--${name} exige valor na forma --${name}=<valor>`)
  return found.slice(prefix.length)
}

const isIsoInstant = (value) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))

/** Corte vigente: `--cutoff=` explícito ou o módulo TS do repositório. */
function resolveCutoff() {
  const explicit = argValue('cutoff') ?? process.env.ANALYTICAL_CUTOFF_UTC
  if (explicit != null) {
    if (!isIsoInstant(explicit)) throw new Error(`--cutoff inválido: ${JSON.stringify(explicit)}`)
    return { cutoffUtc: explicit, source: 'argumento' }
  }
  let source
  try {
    source = readFileSync(METADATA_PATH, 'utf8')
  } catch (error) {
    throw new Error(`não foi possível ler src/sourceMetadata.ts: ${error.message}`)
  }
  const match = source.match(/ANALYTICAL_CUTOFF_UTC\s*=\s*'([^']+)'/)
  if (!match) throw new Error('ANALYTICAL_CUTOFF_UTC não encontrado em src/sourceMetadata.ts')
  const cutoffUtc = match[1]
  if (!isIsoInstant(cutoffUtc)) {
    throw new Error(`ANALYTICAL_CUTOFF_UTC inválido em src/sourceMetadata.ts: ${JSON.stringify(cutoffUtc)}`)
  }
  return { cutoffUtc, source: 'src/sourceMetadata.ts' }
}

function resolveMaxAgeHours() {
  const raw = argValue('max-age-hours')
  if (raw == null || raw === '') return DEFAULT_MAX_AGE_HOURS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--max-age-hours inválido: ${JSON.stringify(raw)}`)
  return parsed
}

function resolveNow() {
  const raw = argValue('now')
  if (raw == null || raw === '') return { instant: new Date(), source: 'relógio do runner' }
  if (!isIsoInstant(raw)) throw new Error(`--now inválido: ${JSON.stringify(raw)}`)
  return { instant: raw, source: 'argumento' }
}

/** Flag booleana, só na forma exata `--nome` (sem valor). */
const hasFlag = (name) => process.argv.slice(2).includes(`--${name}`)

function resolveSnapshotsDir() {
  const raw = argValue('snapshots-dir')
  if (raw == null || raw === '') return SNAPSHOTS_DIR
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
}

/**
 * Kickoffs concluídos dos snapshots de scoreboard — a evidência de calendário.
 *
 * `kickoffs: null` significa "não deu para ler": o chamador volta ao modo
 * ruidoso em vez de tratar ausência de leitura como ausência de jogo. Um
 * arquivo corrompido entre vários legíveis é reportado, mas não invalida a
 * evidência dos demais.
 */
function resolveCalendar(snapshotsDir) {
  let entries
  try {
    entries = readdirSync(snapshotsDir)
  } catch (error) {
    return { kickoffs: null, reason: `diretório de snapshots ilegível (${snapshotsDir}): ${error.code ?? error.message}` }
  }
  const files = entries.filter((file) => SCOREBOARD_FILE_RE.test(file)).sort()
  if (files.length === 0) return { kickoffs: null, reason: `nenhum espn-scoreboard-*.json em ${snapshotsDir}` }

  const kickoffs = []
  const failures = []
  let readable = 0
  for (const file of files) {
    try {
      const payload = JSON.parse(readFileSync(join(snapshotsDir, file), 'utf8'))
      readable += 1
      kickoffs.push(...completedKickoffsFromScoreboard(payload))
    } catch (error) {
      failures.push(`${file}: ${error.message}`)
    }
  }
  if (readable === 0) {
    return { kickoffs: null, reason: `nenhum snapshot legível em ${snapshotsDir} (${failures.length} falha(s))` }
  }
  return { kickoffs, files: readable, failures }
}

const formatHours = (hours) => (hours >= 0 ? `${hours.toFixed(1)}h` : `${hours.toFixed(1)}h (corte no futuro)`)

function main() {
  let cutoff
  let maxAgeHours
  let now
  let snapshotsDir
  try {
    cutoff = resolveCutoff()
    maxAgeHours = resolveMaxAgeHours()
    now = resolveNow()
    snapshotsDir = resolveSnapshotsDir()
  } catch (error) {
    annotate('error', `Alarme de frescor não pôde avaliar o pacote: ${error.message}`)
    return EXIT_PARSE_ERROR
  }

  const hours = stalenessHours({ cutoffUtc: cutoff.cutoffUtc, now: now.instant })
  if (hours == null) {
    annotate('error', `Alarme de frescor não pôde avaliar o pacote: corte ${cutoff.cutoffUtc} não forma um instante válido`)
    return EXIT_PARSE_ERROR
  }

  const nowIso = new Date(now.instant).toISOString()
  const context = `corte ${cutoff.cutoffUtc} (${cutoff.source}) · agora ${nowIso} (${now.source}) · idade ${formatHours(hours)} · limite ${maxAgeHours}h`
  const stale = isStale({ cutoffUtc: cutoff.cutoffUtc, now: now.instant, maxAgeHours })

  if (!stale) {
    annotate('notice', `Pacote de dados em dia: ${context}.`)
    return EXIT_FRESH
  }

  const staleMessage = `Pacote de dados defasado: ${context}. Rode o updater (npm run update:data) e verifique o push do workflow.`

  if (hasFlag('ignore-calendar')) {
    annotate('notice', `Calendário ignorado por --ignore-calendar: decisão por idade crua (${formatHours(hours)} >= ${maxAgeHours}h).`)
    annotate('error', staleMessage)
    return EXIT_STALE
  }

  const calendar = resolveCalendar(snapshotsDir)
  if (calendar.kickoffs == null) {
    annotate('warning', `Decisão por idade crua: ${calendar.reason}. O alarme não distingue entressafra de resultado perdido; a idade ${formatHours(hours)} vence o limite ${maxAgeHours}h.`)
    annotate('error', staleMessage)
    return EXIT_STALE
  }
  for (const failure of calendar.failures) {
    annotate('warning', `Snapshot de scoreboard ignorado: ${failure}`)
  }

  if (expectedResultPending({ cutoffUtc: cutoff.cutoffUtc, now: now.instant, kickoffs: calendar.kickoffs })) {
    annotate(
      'error',
      `Pacote de dados defasado: ${context}. Há partida encerrada com kickoff na janela (corte, agora-${DEFAULT_GRACE_HOURS}h] e sem resultado no pacote; ${calendar.kickoffs.length} kickoff(s) concluído(s) lidos de ${calendar.files} snapshot(s). Rode o updater (npm run update:data) e verifique a conciliação e o push do workflow.`,
    )
    return EXIT_STALE
  }

  const publishByIso = new Date(Date.parse(nowIso) - DEFAULT_GRACE_HOURS * 3_600_000).toISOString()
  annotate(
    'notice',
    `Pacote sem resultado novo para publicar: ${context}. Nenhuma partida encerrada com kickoff entre o corte e ${publishByIso} (carência ${DEFAULT_GRACE_HOURS}h) em ${calendar.files} snapshot(s): entressafra/parada, não resultado perdido.`,
  )
  return EXIT_FRESH
}

process.exitCode = main()
