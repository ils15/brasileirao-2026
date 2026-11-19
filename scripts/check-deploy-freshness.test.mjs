/**
 * Contrato da sonda de publicação: o mesmo script é alarme advisory no deploy
 * (`continue-on-error`, sai 0) e sonda strict no agendado (1 = defasado,
 * 2 = não deu para verificar). Os fixtures são servidos por um `node:http`
 * local: nada de CDN, nada de rede externa.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(ROOT, 'scripts/check-deploy-freshness.mjs')

/** Identidades sintéticas: só hexadecimal, sem relação com o commit real. */
const CURRENT_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const OLD_SHA = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c'

/**
 * data-fixa: fixture sintética — instante inventado para o bundle de mentira.
 * Construído por `Date.UTC` para não existir literal ISO no arquivo.
 */
const BUILD_INSTANT = new Date(Date.UTC(2026, 0, 5, 12, 0, 0)).toISOString()

/**
 * Cenários: o terceiro HTML aponta para um asset que não existe (404), que é
 * "não consegui verificar" — nunca "defasado".
 */
const SCENARIOS = [
  { label: 'bundle com o SHA atual', path: '/current/', strictExit: 0 },
  { label: 'bundle com SHA antigo', path: '/stale/', strictExit: 1 },
  { label: 'bundle ausente (404)', path: '/missing/', strictExit: 2 },
]

let server
let baseUrl

function sendHtml(response, asset) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html><html><body><script type="module" crossorigin src="${asset}"></script></body></html>`)
}

function sendBundle(response, sha) {
  response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
  response.end(`/* build ${BUILD_INSTANT} */const b="${sha}",t="${BUILD_INSTANT}";export{b as __BUILD_SHA__,t as __BUILD_TIME__};`)
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://127.0.0.1')
    if (pathname === '/current/') return sendHtml(response, './assets/index-current.js')
    if (pathname === '/stale/') return sendHtml(response, './assets/index-stale.js')
    if (pathname === '/missing/') return sendHtml(response, './assets/index-missing.js')
    if (pathname === '/current/assets/index-current.js') return sendBundle(response, CURRENT_SHA)
    if (pathname === '/stale/assets/index-stale.js') return sendBundle(response, OLD_SHA)
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

/** Roda a sonda num processo separado, como o workflow roda. */
function runCheck(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

const probeArgs = (scenario) => [`--url=${baseUrl}${scenario.path}`, `--expect-sha=${CURRENT_SHA}`, '--backoff=0']

describe('sonda de publicação — modo advisory (padrão)', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.label}: sai 0`, async () => {
      const result = await runCheck(probeArgs(scenario))
      expect(result.code, result.stdout + result.stderr).toBe(0)
    })
  }

  it('defasagem vira warning e não altera o código de saída', async () => {
    const result = await runCheck(probeArgs(SCENARIOS[1]))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('::warning::Defasagem suspeita')
  })

  it('bundle inacessível vira notice, não warning de defasagem', async () => {
    const result = await runCheck(probeArgs(SCENARIOS[2]))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('::notice::Não foi possível verificar')
  })
})

describe('sonda de publicação — modo strict', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.label}: sai ${scenario.strictExit}`, async () => {
      const result = await runCheck([...probeArgs(scenario), '--strict'])
      expect(result.code, result.stdout + result.stderr).toBe(scenario.strictExit)
    })
  }

  it('aceita prefixo de 7 caracteres do SHA publicado', async () => {
    const result = await runCheck([
      `--url=${baseUrl}/current/`,
      `--expect-sha=${CURRENT_SHA.slice(0, 7)}`,
      '--backoff=0',
      '--strict',
    ])
    expect(result.code, result.stdout + result.stderr).toBe(0)
  })

  it('SHA divergente no bundle atual sai 1', async () => {
    const result = await runCheck([`--url=${baseUrl}/current/`, '--expect-sha=0000000', '--backoff=0', '--strict'])
    expect(result.code, result.stdout + result.stderr).toBe(1)
  })

  it('SHA curto demais é argumento inválido: sai 2, não 1', async () => {
    const result = await runCheck([`--url=${baseUrl}/current/`, '--expect-sha=abc123', '--backoff=0', '--strict'])
    expect(result.code, result.stdout + result.stderr).toBe(2)
  })
})
