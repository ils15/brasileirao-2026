/**
 * Sentinela antirregressão da suíte: um teste não pode voltar a cravar dado
 * que o pacote regenera a cada coleta automática.
 *
 * O pipeline roda o gate de dados (`npm run test:data`, este arquivo incluso)
 * com dados recém-coletados e a suíte completa no workflow; uma data de
 * corte ou uma contagem do pacote escrita à mão transforma a atualização
 * automática em falha de release (foi assim que o pipeline parou por dias).
 *
 * Duas famílias de literal são proibidas:
 *  1. data de corte/pacote — `dd/mm/2026 … BRT` em qualquer linha, ou instante
 *     ISO com minutos dentro de uma expectativa (`expect(...)`, `toBe`,
 *     `toContain`…). Fixtures de entrada não são flagradas: o alvo é o valor
 *     que o teste *afirma*.
 *  2. contagem do pacote em `toHaveLength`/`toBe` — 27, 39, 305, 339, 341.
 *
 * 380 fica de fora: é invariante estrutural (20 clubes × 38 rodadas ÷ 2) e é
 * o único número do calendário que o teste pode afirmar.
 *
 * Opt-out, na mesma linha do literal: `// data-fixa: <motivo>`. Use só para
 * fixture sintética (partida inventada, payload de API) ou registro histórico
 * já empacotado que não muda; nunca para o corte vigente.
 *
 * Limite conhecido: o sentinela é um tripwire de linha, não uma prova. Um
 * literal guardado numa variável e afirmado depois ainda passaria — por isso
 * os testes de dados derivam direto dos módulos (`seasonFacts`, `SCORERS`,
 * `HISTORICAL_SOURCE`), e não de intermediários.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SELF = 'scripts/data-assertions.test.mjs'
const MARKER = 'data-fixa:'

/** Linhas que afirmam um valor (o que o teste passa a exigir do pacote). */
const EXPECTATION_RE = /\bexpect\s*\(|\.to(?:Be|Equal|Contain|Match|MatchObject|HaveTextContent|HaveLength)\s*\(/

/** Datas que só fazem sentido se derivadas do pacote. */
const DATE_PATTERNS = [
  // "06/11/2026 · 21:58:14 BRT" — texto de corte escrito à mão.
  { label: 'data de corte em BRT', re: /\d{2}\/\d{2}\/20\d{2}[^\n]{0,40}BRT/, anywhere: true },
  // "2026-11-15T02:39:43Z" — instante do pacote ou da captura.
  { label: 'instante ISO literal em asserção', re: /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}/, anywhere: false },
]

/**
 * Contagens do pacote que mudam com a rodada (atletas, resultados, pendentes).
 * 380 é invariante estrutural e por isso está fora da lista.
 */
const PACKAGE_COUNTS = [27, 39, 305, 339, 341]
const COUNT_RE = new RegExp(`(?:toHaveLength|toBe)\\(\\s*(?:${PACKAGE_COUNTS.join('|')})\\s*\\)`)

function testFiles(directory) {
  const found = []
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      found.push(...testFiles(path))
    } else if (/\.test\.(?:ts|tsx|mjs)$/.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

function offenders(file, check) {
  const hits = []
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (line.includes(MARKER)) return
    if (!check.anywhere && !EXPECTATION_RE.test(line)) return
    if (!check.re.test(line)) return
    hits.push(`${file}:${index + 1}: ${check.label} → ${line.trim()}`)
  })
  return hits
}

describe('asserções dos testes não cravam dados do pacote', () => {
  const files = [...testFiles('src'), ...testFiles('scripts')].filter((file) => file !== SELF)

  it('nenhum teste crava data de corte ou instante de captura', () => {
    const hits = files.flatMap((file) => DATE_PATTERNS.flatMap((check) => offenders(file, check)))
    expect(hits).toEqual([])
  })

  it('nenhum teste crava contagem do pacote (305 atletas, 339/341 resultados, 39 pendentes)', () => {
    const hits = files.flatMap((file) => offenders(file, { label: 'contagem do pacote', re: COUNT_RE, anywhere: true }))
    expect(hits).toEqual([])
  })

  it('o próprio sentinela continua cobrindo os testes existentes', () => {
    expect(files).toContain('src/App.test.tsx')
    expect(files).toContain('scripts/lib/dataPipeline.test.mjs')
    expect(files.length).toBeGreaterThanOrEqual(20)
  })
})
