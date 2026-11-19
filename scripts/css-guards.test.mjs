/**
 * Guards de CSS que não podem regredir sem quebrar acessibilidade:
 * movimento reduzido (WCAG 2.3.3) e cores forçadas (WCAG 1.4.1 / 1.4.11).
 *
 * Lê `src/styles.css` como texto. Fail-closed: bloco ausente, override
 * ausente ou contagem insuficiente reprovam — nunca `skip`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const CSS = readFileSync(join(ROOT, 'src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Corpo de um at-rule, com casamento de chaves. Lança quando o cabeçalho ou o
 * fechamento não existem: um guard que não encontra o bloco precisa falhar.
 */
function atRuleBody(source, header) {
  const start = source.indexOf(header)
  if (start === -1) throw new Error(`bloco ausente em src/styles.css: ${header}`)

  const open = source.indexOf('{', start)
  if (open === -1) throw new Error(`bloco sem abertura: ${header}`)

  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  throw new Error(`bloco sem fechamento: ${header}`)
}

/** Regras folha dentro de um bloco: `{ selectors, body }`. */
function leafRules(body) {
  const rules = []
  for (const match of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({
      selectors: match[1].split(',').map((selector) => selector.trim()).filter(Boolean),
      body: match[2],
    })
  }
  return rules
}

describe('guards de acessibilidade do styles.css', () => {
  it('respeita prefers-reduced-motion no scroll e nas animações', () => {
    const declarations = leafRules(atRuleBody(CSS, '@media (prefers-reduced-motion: reduce)'))
    const withScrollBehavior = declarations.filter((rule) => /scroll-behavior\s*:\s*auto/.test(rule.body))

    expect(withScrollBehavior.length, 'override de scroll-behavior ausente').toBeGreaterThan(0)
    expect(
      declarations.some((rule) => /animation-duration\s*:\s*\.?0*\.?01ms|animation-duration\s*:\s*0/.test(rule.body)),
      'animação não é encurtada no movimento reduzido',
    ).toBe(true)
    expect(
      declarations.some((rule) => /transition-duration\s*:\s*\.?0*\.?01ms|transition-duration\s*:\s*0/.test(rule.body)),
      'transição não é encurtada no movimento reduzido',
    ).toBe(true)
  })

  it('desenha contorno para barras, chips, badges e disclosures em forced-colors', () => {
    const selectors = leafRules(atRuleBody(CSS, '@media (forced-colors: active)'))
      .filter((rule) => /(^|[;\s])border(-color|-top|-right|-bottom|-left)?\s*:/.test(rule.body))
      .flatMap((rule) => rule.selectors)

    expect(selectors.length, 'menos de 3 seletores com borda em forced-colors').toBeGreaterThanOrEqual(3)

    for (const required of ['.zone-bar', '.zone-chip', '.form-dot', '.delta-badge', 'summary']) {
      expect(selectors, `${required} sem contorno em forced-colors`).toContain(required)
    }
  })
})
