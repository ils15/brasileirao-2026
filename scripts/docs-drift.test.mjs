/**
 * Guarda contra desvio entre a documentação e o pacote de dados.
 *
 * O README já afirmou um corte analítico e uma contagem de resultados que
 * envelheceram em silêncio: o texto público repetia a captura de dias antes.
 * Esses valores mudam a cada coleta e moram onde são gerados — a aba
 * "Metodologia & Auditoria" do site e `docs/atualizacoes.md` —, então o README
 * aponta para eles em vez de copiá-los.
 *
 * Escopo: `README.md` (estado vigente, sem exceção) e os dois documentos de
 * auditoria, onde números históricos são legítimos. Ali as regras só alcançam
 * formulações de presente ("pacote atual", "o corte analítico é <instante>")
 * e as linhas do glossário que descrevem o pacote corrente — um trecho
 * histórico pode continuar citando 341 jogos, capturas datadas e o corte de
 * 2026-11-15. `docs/atualizacoes.md` é gerado e lista as capturas por data;
 * ali o instante ISO é legítimo.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

/** Instante ISO completo (ano-mês-dia, hora:minuto) — corte ou captura cravados. */
const ISO_INSTANT_RE = /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}/

/** Frase que prometia o corte vigente no próprio README (tolerante a ênfase markdown). */
const CUTOFF_CLAIM_RE = /corte[\s*_]+anal[ií]tico[\s*_]+atual[\s*_]+[eé]/i

describe('README não crava dado que a coleta regenera', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')

  it('o arquivo lido é o README do projeto', () => {
    expect(readme).toContain('brasileirao-2026')
    expect(readme).toContain('docs/atualizacoes.md')
    expect(readme.length).toBeGreaterThan(1000)
  })

  it('não repete instante ISO do corte ou da captura', () => {
    const hits = readme
      .split('\n')
      .flatMap((line, index) => (ISO_INSTANT_RE.test(line) ? [`README.md:${index + 1}: ${line.trim()}`] : []))
    expect(hits).toEqual([])
  })

  it('não afirma o corte analítico vigente', () => {
    const hits = readme
      .split('\n')
      .flatMap((line, index) => (CUTOFF_CLAIM_RE.test(line) ? [`README.md:${index + 1}: ${line.trim()}`] : []))
    expect(hits).toEqual([])
  })
})

/**
 * Só formulações que afirmam o presente. Um registro histórico ("foi capturado
 * em ...", "no corte de ...", "à época") não casa com nenhuma delas e segue
 * intocado — é justamente o valor dos documentos de auditoria.
 */
const STALE_CLAIM_RES = [
  /\bpacote atual de \d[\d.]* resultados\b/i,
  /\bfrente aos \d[\d.]* resultados do pacote\b/i,
  /\bcorte anal[ií]tico é\s+`?20\d{2}-\d{2}-\d{2}T/,
]

/** Contagem e instante do pacote corrente, que a coleta regenera. */
const VIGENT_COUNT_RE = /\b\d[\d.]* resultados \+ \d[\d.]* pendentes\b/
const VIGENT_INSTANT_RE = /20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}|\b\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/

const STATE_DOCS = ['docs/auditoria-calculos.md', 'docs/dicionario-dados.md']

describe('docs de auditoria apontam o estado vigente em vez de copiá-lo', () => {
  for (const doc of STATE_DOCS) {
    const text = readFileSync(join(ROOT, doc), 'utf8')
    const lines = text.split('\n')
    const label = (index) => `${doc}:${index + 1}: ${lines[index].trim()}`

    it(`${doc}: é o documento esperado e aponta o log`, () => {
      expect(text.length).toBeGreaterThan(1000)
      expect(text).toContain('docs/atualizacoes.md')
    })

    it(`${doc}: não afirma contagem ou corte vigente`, () => {
      const hits = lines.flatMap((line, index) =>
        STALE_CLAIM_RES.some((re) => re.test(line)) ? [label(index)] : [],
      )
      expect(hits).toEqual([])
    })
  }
})

describe('dicionário de dados: linhas do pacote corrente apontam o log', () => {
  const lines = readFileSync(join(ROOT, 'docs/dicionario-dados.md'), 'utf8').split('\n')
  const row = (marker) => lines.filter((line) => line.includes(marker))

  it('Validação da temporada 2026 não crava a contagem do pacote', () => {
    const rows = row('**Validação da temporada 2026**')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('docs/atualizacoes.md')
    expect(VIGENT_COUNT_RE.test(rows[0])).toBe(false)
  })

  it('Snapshot estático não crava o instante de geração', () => {
    const rows = row('**Snapshot estático**')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('docs/atualizacoes.md')
    expect(VIGENT_INSTANT_RE.test(rows[0])).toBe(false)
  })
})
