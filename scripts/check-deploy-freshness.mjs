#!/usr/bin/env node
/**
 * Alerta de defasagem do pacote publicado no GitHub Pages.
 *
 * Por padrão este script é um ALARME, não um gate: ele NUNCA falha o run.
 * Qualquer divergência ou falha de rede vira `::warning::`/`::notice::` e o
 * processo termina com código 0. O job que o chama também usa
 * `continue-on-error`, então nem uma exceção inesperada derruba o workflow de
 * publicação.
 *
 * Com `--strict` ele passa a distinguir os dois desfechos que o alarme mistura:
 * "o site está defasado" (1) e "não consegui verificar" (2). É o modo usado
 * pela sonda agendada, longe do deploy, onde o código de saída é o sinal.
 *
 * O que ele confere: o bundle publicado (`assets/index-*.js`) contém o corte
 * analítico do repositório (`ANALYTICAL_CUTOFF_UTC` em src/sourceMetadata.ts)
 * ou o SHA do build (`__BUILD_SHA__`, gravado por `vite.config.ts`)? Se não
 * contém, o Pages está servindo build anterior ao commit atual — ou o deploy
 * ainda está propagando no CDN.
 *
 * Uso:
 *   node scripts/check-deploy-freshness.mjs
 *   node scripts/check-deploy-freshness.mjs --expect=<corte UTC>
 *   node scripts/check-deploy-freshness.mjs --expect-sha=$(git rev-parse HEAD) --strict
 *   node scripts/check-deploy-freshness.mjs --url=http://127.0.0.1:4173/ --backoff=0
 *
 * Saída: 1 sondagem imediata + até N retries (padrão 15s/30s), porque o CDN do
 * Pages pode servir o HTML/bundle antigos por dezenas de segundos após o
 * deploy. Códigos de saída: sem `--strict`, sempre 0 (advisory); com
 * `--strict`, 0 = em dia, 1 = bundle de outro commit, 2 = não foi possível
 * verificar (rede/HTTP/argumento inválido).
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_URL = 'https://ils15.github.io/brasileirao-2026/'
const DEFAULT_BACKOFF_MS = [15_000, 30_000]
const FETCH_TIMEOUT_MS = 20_000

/** SHA hexadecimal completo ou prefixo do git (≥7 caracteres). */
const SHA_RE = /^[0-9a-f]{7,40}$/

const EXIT_OK = 0
const EXIT_DIVERGED = 1
const EXIT_UNVERIFIED = 2

/** Anotação do GitHub Actions, com escape obrigatório de `%`, CR e LF. */
function annotate(level, message) {
  const escaped = String(message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  console.log(`::${level}::${escaped}`)
}

/** Valor de uma flag só na forma `--nome=valor`; flag solta é erro de uso. */
function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  if (found) return found.slice(prefix.length)
  if (process.argv.includes(`--${name}`)) {
    throw new Error(`--${name} exige valor na forma --${name}=<valor>`)
  }
  return undefined
}

function parseBackoff(raw) {
  if (raw == null) return DEFAULT_BACKOFF_MS
  const parsed = raw.split(',').map((piece) => Number(piece.trim()))
  if (parsed.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`--backoff inválido: ${raw}`)
  }
  return parsed
}

/**
 * SHA esperado, minúsculo para comparar com o bundle. Prefixo de 7 caracteres
 * basta: é o mesmo encurtamento que o git exibe e o que uma pessoa cola.
 */
function expectedSha(raw) {
  if (raw == null || raw === '') return null
  const value = String(raw).trim().toLowerCase()
  if (!SHA_RE.test(value)) {
    throw new Error(`--expect-sha inválido: ${JSON.stringify(raw)} (esperado hexadecimal de 7 a 40 caracteres)`)
  }
  return value
}

/** Corte esperado: argv/env explícitos ou, preferencialmente, o módulo TS do repo. */
function expectedCutoffs(explicitUtc) {
  if (explicitUtc) return { utc: explicitUtc, local: null, source: 'argumento' }
  const moduleSource = readFileSync(join(ROOT, 'src/sourceMetadata.ts'), 'utf8')
  const utc = moduleSource.match(/ANALYTICAL_CUTOFF_UTC\s*=\s*'([^']+)'/)?.[1]
  const local = moduleSource.match(/ANALYTICAL_CUTOFF_LOCAL\s*=\s*'([^']+)'/)?.[1]
  if (!utc) throw new Error('ANALYTICAL_CUTOFF_UTC não encontrado em src/sourceMetadata.ts')
  return { utc, local, source: 'src/sourceMetadata.ts' }
}

async function getText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'brasileirao-2026-freshness/1.0', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`)
  return response.text()
}

/**
 * Uma sondagem completa: HTML → asset → bundle → identidade do build.
 *
 * Com SHA esperado a checagem do corte é dispensada: o SHA só existe no bundle
 * porque `__BUILD_SHA__` veio do commit que também contém o corte, então ele é
 * uma identidade mais forte. Sem SHA, o sinal continua sendo o corte.
 */
async function probe(baseUrl, cutoff, sha) {
  const html = await getText(baseUrl)
  const assetPath = html.match(/(?:src|href)="([^"]*assets\/index-[^"]+\.js)"/)?.[1]
  if (!assetPath) throw new Error('nenhum asset assets/index-*.js no HTML publicado')
  const assetUrl = new URL(assetPath, baseUrl).href
  const bundle = await getText(assetUrl)
  const hasUtc = cutoff != null && bundle.includes(cutoff.utc)
  const hasLocal = cutoff?.local != null && bundle.includes(cutoff.local)
  const hasSha = sha != null && bundle.toLowerCase().includes(sha)
  return { assetUrl, fresh: sha != null ? hasSha : hasUtc || hasLocal }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const strict = process.argv.includes('--strict')
  let options
  try {
    const sha = expectedSha(argValue('expect-sha') ?? process.env.EXPECTED_BUILD_SHA)
    options = {
      baseUrl: argValue('url') ?? process.env.FRESHNESS_URL ?? DEFAULT_URL,
      backoff: parseBackoff(argValue('backoff') ?? process.env.FRESHNESS_BACKOFF_MS),
      sha,
      // Com SHA esperado o corte não é necessário: não leia o módulo à toa.
      cutoff: sha != null ? null : expectedCutoffs(argValue('expect') ?? process.env.EXPECTED_CUTOFF_UTC),
    }
  } catch (error) {
    annotate(strict ? 'error' : 'notice', `Verificação de frescor não pôde rodar: ${error.message}`)
    return strict ? EXIT_UNVERIFIED : EXIT_OK
  }

  const { baseUrl, backoff, sha, cutoff } = options
  const target = sha != null ? `o SHA ${sha} do build` : `o corte ${cutoff.utc} (${cutoff.source})`
  const attempts = backoff.length + 1
  let divergence = null
  let networkFailure = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(backoff[attempt - 2])
    try {
      const result = await probe(baseUrl, cutoff, sha)
      if (result.fresh) {
        annotate(
          'notice',
          `Pages em dia: ${result.assetUrl} publica ${target}, sondagem ${attempt}/${attempts}.`,
        )
        return EXIT_OK
      }
      divergence = `bundle publicado não contém ${target}; o Pages parece servir build anterior ao commit`
      console.log(`  sondagem ${attempt}/${attempts}: ${result.assetUrl} sem ${target}`)
    } catch (error) {
      networkFailure = `sondagem ${attempt}/${attempts} falhou: ${error.message}`
      console.log(`  ${networkFailure}`)
    }
  }

  // Divergência só é afirmada quando alguma sondagem chegou a ler o bundle;
  // rede/CDN fora do ar é limitação de verificação, não sinal de defasagem.
  if (divergence) {
    if (strict) {
      annotate('error', `Site publicado defasado em ${baseUrl}: ${divergence}.`)
      return EXIT_DIVERGED
    }
    annotate('warning', `Defasagem suspeita em ${baseUrl}: ${divergence}. Alerta apenas — não bloqueia o deploy.`)
    return EXIT_OK
  }

  if (strict) {
    annotate('error', `Não foi possível verificar ${baseUrl} (${networkFailure}); o site não está confirmado como defasado.`)
    return EXIT_UNVERIFIED
  }
  annotate('notice', `Não foi possível verificar ${baseUrl} (${networkFailure}). Alerta apenas — não bloqueia o deploy.`)
  return EXIT_OK
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    const strict = process.argv.includes('--strict')
    const message = `Verificação de frescor não concluída (${error.message}); ${
      strict ? 'site não verificado.' : 'alerta apenas, deploy não afetado.'
    }`
    annotate(strict ? 'error' : 'warning', message)
    process.exitCode = strict ? EXIT_UNVERIFIED : EXIT_OK
  })
