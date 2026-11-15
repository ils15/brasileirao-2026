#!/usr/bin/env node
/**
 * Alerta de defasagem do pacote publicado no GitHub Pages.
 *
 * Este script é um ALARME, não um gate: ele NUNCA falha o run. Qualquer
 * divergência ou falha de rede vira `::warning::`/`::notice::` e o processo
 * termina com código 0. O job que o chama também usa `continue-on-error`,
 * então nem uma exceção inesperada derruba o workflow de publicação.
 *
 * O que ele confere: o bundle publicado (`assets/index-*.js`) contém o corte
 * analítico do repositório (`ANALYTICAL_CUTOFF_UTC` em src/sourceMetadata.ts)?
 * Se não contém, o Pages está servindo build anterior ao commit atual — ou o
 * deploy ainda está propagando no CDN.
 *
 * Uso:
 *   node scripts/check-deploy-freshness.mjs
 *   node scripts/check-deploy-freshness.mjs --expect=2026-11-15T02:39:43Z
 *   node scripts/check-deploy-freshness.mjs --url=http://127.0.0.1:4173/ --backoff=0
 *
 * Saída: 1 sondagem imediata + até N retries (padrão 15s/30s), porque o CDN do
 * Pages pode servir o HTML/bundle antigos por dezenas de segundos após o
 * deploy. Códigos de saída: sempre 0.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_URL = 'https://ils15.github.io/brasileirao-2026/'
const DEFAULT_BACKOFF_MS = [15_000, 30_000]
const FETCH_TIMEOUT_MS = 20_000

/** Anotação do GitHub Actions, com escape obrigatório de `%`, CR e LF. */
function annotate(level, message) {
  const escaped = String(message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  console.log(`::${level}::${escaped}`)
}

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function parseBackoff(raw) {
  if (raw == null) return DEFAULT_BACKOFF_MS
  const parsed = raw.split(',').map((piece) => Number(piece.trim()))
  if (parsed.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`--backoff inválido: ${raw}`)
  }
  return parsed
}

/** Corte esperado: argv/env explícitos ou, preferencialmente, o módulo TS do repo. */
function expectedCutoffs() {
  const explicitUtc = argValue('expect') ?? process.env.EXPECTED_CUTOFF_UTC
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

/** Uma sondagem completa: HTML → asset → bundle → presença do corte. */
async function probe(baseUrl, cutoff) {
  const html = await getText(baseUrl)
  const assetPath = html.match(/(?:src|href)="([^"]*assets\/index-[^"]+\.js)"/)?.[1]
  if (!assetPath) throw new Error('nenhum asset assets/index-*.js no HTML publicado')
  const assetUrl = new URL(assetPath, baseUrl).href
  const bundle = await getText(assetUrl)
  const hasUtc = bundle.includes(cutoff.utc)
  const hasLocal = cutoff.local != null && bundle.includes(cutoff.local)
  return { assetUrl, hasUtc, hasLocal }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const baseUrl = argValue('url') ?? process.env.FRESHNESS_URL ?? DEFAULT_URL
  const backoff = parseBackoff(argValue('backoff') ?? process.env.FRESHNESS_BACKOFF_MS)
  let cutoff
  try {
    cutoff = expectedCutoffs()
  } catch (error) {
    annotate('notice', `Verificação de frescor ignorada: ${error.message}`)
    return
  }

  const attempts = backoff.length + 1
  let divergence = null
  let networkFailure = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(backoff[attempt - 2])
    try {
      const result = await probe(baseUrl, cutoff)
      if (result.hasUtc || result.hasLocal) {
        annotate(
          'notice',
          `Pages em dia: ${result.assetUrl} publica o corte ${cutoff.utc} (${cutoff.source}), sondagem ${attempt}/${attempts}.`,
        )
        return
      }
      divergence = `bundle publicado não contém o corte ${cutoff.utc} (${cutoff.source}); o Pages parece servir build anterior ao commit`
      console.log(`  sondagem ${attempt}/${attempts}: ${result.assetUrl} sem o corte esperado`)
    } catch (error) {
      networkFailure = `sondagem ${attempt}/${attempts} falhou: ${error.message}`
      console.log(`  ${networkFailure}`)
    }
  }

  // Divergência só é afirmada quando alguma sondagem chegou a ler o bundle;
  // rede/CDN fora do ar é limitação de verificação, não sinal de defasagem.
  if (divergence) {
    annotate('warning', `Defasagem suspeita em ${baseUrl}: ${divergence}. Alerta apenas — não bloqueia o deploy.`)
    return
  }
  annotate('notice', `Não foi possível verificar ${baseUrl} (${networkFailure}). Alerta apenas — não bloqueia o deploy.`)
}

main()
  .catch((error) => {
    annotate('warning', `Verificação de frescor não concluída (${error.message}); alerta apenas, deploy não afetado.`)
  })
  .finally(() => {
    process.exitCode = 0
  })
