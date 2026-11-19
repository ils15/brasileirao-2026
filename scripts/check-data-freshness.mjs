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
 *
 * Saída: `::notice::` quando fresco, `::error::` quando defasado. Códigos:
 * 0 = fresco, 1 = defasado, 2 = erro de parsing (corte ausente/inválido, flag
 * inválida). Nunca confunde "não consegui ler" com "está fresco".
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stalenessHours } from './lib/freshness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const METADATA_PATH = join(ROOT, 'src/sourceMetadata.ts')
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

const formatHours = (hours) => (hours >= 0 ? `${hours.toFixed(1)}h` : `${hours.toFixed(1)}h (corte no futuro)`)

function main() {
  let cutoff
  let maxAgeHours
  let now
  try {
    cutoff = resolveCutoff()
    maxAgeHours = resolveMaxAgeHours()
    now = resolveNow()
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

  if (hours >= maxAgeHours) {
    annotate('error', `Pacote de dados defasado: ${context}. Rode o updater (npm run update:data) e verifique o push do workflow.`)
    return EXIT_STALE
  }
  annotate('notice', `Pacote de dados em dia: ${context}.`)
  return EXIT_FRESH
}

process.exitCode = main()
