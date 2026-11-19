/**
 * Gate de contraste calculado (WCAG 2.2 SC 1.4.3 e 1.4.11).
 *
 * O teste lê `src/styles.css` e resolve, por escopo de tema, as cores que o
 * navegador realmente aplica: `:root` (claro), `:root[data-theme='dark']` e
 * `:root[data-theme='system']` dentro de `prefers-color-scheme: dark`.
 *
 * Fail-closed: token ausente no escopo reprova nomeando o token, par abaixo do
 * limiar reprova nomeando par e razão. Não existe allowlist silenciosa — uma
 * exceção precisa aparecer na própria linha do par, como
 * `// contraste-ok: <razão> — <justificativa>`, e a razão declarada é
 * conferida contra o cálculo.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const STYLESHEET = join(ROOT, 'src/styles.css')
const SELF = join(ROOT, 'scripts/contrast.test.mjs')

const NORMAL_TEXT = 4.5
const LARGE_TEXT = 3.0
const UI_COMPONENT = 3.0

/** Limiares por classe de texto: nenhum par deste tema existe só em corpo grande. */
const MIN_RATIO = { normal: NORMAL_TEXT, large: LARGE_TEXT, ui: UI_COMPONENT }

const normalize = (text) => text.replace(/\s+/g, ' ').trim()

/** Regras folha do CSS: `{ at, selector, body }`, `at` sendo o at-rule envolvente. */
function parseRules(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  const atStack = []
  let buffer = ''
  let index = 0

  while (index < css.length) {
    const char = css[index]

    if (char === '{') {
      const prelude = normalize(buffer)
      buffer = ''
      if (prelude.startsWith('@')) {
        atStack.push(prelude)
        index += 1
        continue
      }
      const end = css.indexOf('}', index)
      if (end === -1) throw new Error(`regra sem fechamento em src/styles.css: ${prelude}`)
      rules.push({
        at: atStack.at(-1) ?? null,
        selector: prelude,
        body: css.slice(index + 1, end),
      })
      index = end + 1
      continue
    }

    if (char === '}') {
      atStack.pop()
      buffer = ''
      index += 1
      continue
    }

    buffer += char
    index += 1
  }

  return rules
}

/** Declarações de um corpo de regra, na ordem em que aparecem. */
function declarations(body) {
  const map = new Map()
  for (const chunk of body.split(';')) {
    const colon = chunk.indexOf(':')
    if (colon === -1) continue
    const property = chunk.slice(0, colon).trim()
    const value = chunk.slice(colon + 1).trim()
    if (property && value) map.set(property, value)
  }
  return map
}

function parseColor(value, context) {
  const hex = value.trim().replace(/^#/, '')
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new Error(`cor não hexadecimal em ${context}: ${value}`)
  }
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16))
}

/** Luminância relativa sRGB (WCAG 2.2, definição de `relative luminance`). */
function relativeLuminance([red, green, blue]) {
  const linear = (channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  const [high, low] = first >= second ? [first, second] : [second, first]
  return (high + 0.05) / (low + 0.05)
}

const RULES = parseRules(readFileSync(STYLESHEET, 'utf8'))

const SCOPES = [
  { id: 'claro', selector: ':root', media: null, rulePrefix: null },
  { id: 'escuro', selector: ":root[data-theme='dark']", media: null, rulePrefix: ":root[data-theme='dark'] " },
  {
    id: 'sistema',
    selector: ":root[data-theme='system']",
    media: '@media (prefers-color-scheme: dark)',
    rulePrefix: ":root[data-theme='system'] ",
  },
]

function sameMedia(at, expected) {
  return expected === null ? at === null : at !== null && at.includes(expected)
}

function scopeTokens(scope) {
  const rule = RULES.find((candidate) => candidate.selector === scope.selector && sameMedia(candidate.at, scope.media))
  if (!rule) throw new Error(`escopo de tema ausente em src/styles.css: ${scope.selector} (${scope.id})`)

  const tokens = new Map()
  for (const [property, value] of declarations(rule.body)) {
    if (property.startsWith('--')) tokens.set(property, value)
  }
  if (tokens.size === 0) throw new Error(`escopo sem custom properties: ${scope.selector} (${scope.id})`)
  return tokens
}

const target = (token) => ({ token })
const fromRule = (selector, property = 'color') => ({ selector, property })

function resolveColor(reference, scope) {
  if (reference.token) {
    const value = scope.tokens.get(reference.token)
    if (value === undefined) {
      throw new Error(`token ${reference.token} ausente no escopo ${scope.id}`)
    }
    if (value.includes('var(')) {
      throw new Error(`token ${reference.token} não é cor literal no escopo ${scope.id}: ${value}`)
    }
    return parseColor(value, `${reference.token} (${scope.id})`)
  }

  const candidates = []
  if (scope.rulePrefix) {
    candidates.push({ selector: `${scope.rulePrefix}${reference.selector}`, media: scope.media })
  }
  candidates.push({ selector: reference.selector, media: null })

  for (const candidate of candidates) {
    const rule = RULES.find((item) => item.selector === candidate.selector && sameMedia(item.at, candidate.media))
    if (!rule) continue
    const style = declarations(rule.body)
    const value = style.get(reference.property) ?? style.get('background-color')
    if (value !== undefined) {
      return parseColor(value, `${reference.selector} { ${reference.property} } (${scope.id})`)
    }
  }

  throw new Error(`declaração ${reference.property} ausente para ${reference.selector} no escopo ${scope.id}`)
}

/**
 * Pares que carregam informação. `fg`/`bg` são tokens do tema ou uma
 * declaração real de regra; a ordem espelha o CSS, inclusive nos chips de
 * zona, cujo fundo vem do token `*-text` e o texto do token `*-bg`.
 */
const PAIRS = [
  // texto corrente sobre as superfícies base
  { id: 'texto sobre surface', fg: target('--text'), bg: target('--surface') },
  { id: 'texto sobre paper', fg: target('--text'), bg: target('--paper') },
  { id: 'título sobre surface', fg: target('--ink'), bg: target('--surface') },
  { id: 'texto secundário sobre surface', fg: target('--text-secondary'), bg: target('--surface') },
  { id: 'texto secundário sobre surface-soft', fg: target('--text-secondary'), bg: target('--surface-soft') },
  { id: 'texto muted sobre surface', fg: target('--text-muted'), bg: target('--surface') },
  { id: 'texto muted sobre surface-soft', fg: target('--text-muted'), bg: target('--surface-soft') },
  { id: 'link sobre surface', fg: target('--link'), bg: target('--surface') },
  // mensagens e badges semânticos
  { id: 'erro sobre error-surface', fg: target('--error-text'), bg: target('--error-surface') },
  { id: 'sucesso sobre success-bg', fg: target('--success-text'), bg: target('--success-bg') },
  { id: 'perigo sobre danger-bg', fg: target('--danger-text'), bg: target('--danger-bg') },
  { id: 'variação neutra sobre surface-tint', fg: target('--text-secondary'), bg: target('--surface-tint') },
  { id: 'badge não verificado sobre surface-alt', fg: target('--text'), bg: target('--surface-alt') },
  // chips de zona da classificação (`.zone-chip--*`)
  { id: 'chip Libertadores', fg: target('--zone-lib-bg'), bg: target('--zone-lib-text') },
  { id: 'chip Sul-Americana', fg: target('--zone-sula-bg'), bg: target('--zone-sula-text') },
  { id: 'chip zona intermediária', fg: target('--zone-middle-bg'), bg: target('--zone-middle-text') },
  { id: 'chip rebaixamento', fg: target('--zone-relegation-bg'), bg: target('--zone-relegation-text') },
  // sequência de forma (`.form-dot`): letra branca sobre a cor do resultado
  { id: 'forma vitória', fg: fromRule('.form-dot'), bg: target('--success-badge') },
  { id: 'forma empate', fg: fromRule('.form-dot'), bg: target('--neutral-badge') },
  { id: 'forma derrota', fg: fromRule('.form-dot'), bg: target('--danger-badge') },
  // callout e card de liderança
  { id: 'callout sobre callout-bg', fg: target('--callout-text'), bg: target('--callout-bg') },
  { id: 'leader sobre leader-bg', fg: target('--leader-text'), bg: target('--leader-bg') },
  // badges de fonte (cores literais por tema, declaradas em regra própria)
  { id: 'badge Football-Data', fg: fromRule('.source-badge--football-data'), bg: fromRule('.source-badge--football-data', 'background') },
  { id: 'badge ESPN', fg: fromRule('.source-badge--espn'), bg: fromRule('.source-badge--espn', 'background') },
  // indicador de foco visível: componente de UI, limiar 3:1
  { id: 'foco sobre surface', fg: target('--focus'), bg: target('--surface'), size: 'ui' },
]

const RESOLVED_SCOPES = SCOPES.map((scope) => ({ ...scope, tokens: scopeTokens(scope) }))

/** Exceções declaradas na linha do par; a razão informada é conferida. */
function declaredExceptions() {
  const exceptions = new Map()
  const pattern = /id:\s*'([^']+)'[^\n]*?\/\/\s*contraste-ok:\s*([0-9]+(?:\.[0-9]+)?)\s*—\s*(.+)/g
  for (const match of readFileSync(SELF, 'utf8').matchAll(pattern)) {
    exceptions.set(match[1], { ratio: Number(match[2]), reason: match[3].trim() })
  }
  return exceptions
}

function formatTable(rows) {
  const header = ['escopo', 'par', 'razão', 'mínimo', 'resultado']
  const body = rows.map((row) => [
    row.scope,
    row.id,
    `${row.ratio.toFixed(2)}:1`,
    `${row.min}:1`,
    row.ratio >= row.min ? 'passa' : 'falha',
  ])
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...body.map((line) => line[column].length)),
  )
  return [header, ...body]
    .map((line) => line.map((cell, column) => cell.padEnd(widths[column])).join(' | ').trimEnd())
    .join('\n')
}

describe('gate de contraste do tema', () => {
  it('declara em cada escopo todos os tokens usados nos pares', () => {
    const used = new Set()
    for (const pair of PAIRS) {
      for (const reference of [pair.fg, pair.bg]) {
        if (reference.token) used.add(reference.token)
      }
    }

    for (const scope of RESOLVED_SCOPES) {
      for (const token of used) {
        expect(
          scope.tokens.has(token),
          `token ${token} ausente no escopo ${scope.id}`,
        ).toBe(true)
      }
    }
  })

  it('mantém cada par acima do limiar WCAG em todos os escopos', () => {
    const exceptions = declaredExceptions()
    const rows = []

    for (const scope of RESOLVED_SCOPES) {
      for (const pair of PAIRS) {
        const ratio = contrastRatio(resolveColor(pair.fg, scope), resolveColor(pair.bg, scope))
        const exception = exceptions.get(pair.id)
        const min = MIN_RATIO[pair.size ?? 'normal']

        rows.push({ scope: scope.id, id: pair.id, ratio, min })

        if (exception) {
          expect(
            ratio,
            `${pair.id} (${scope.id}) caiu abaixo da razão documentada em contraste-ok: ${exception.ratio}:1 — ${exception.reason}`,
          ).toBeGreaterThanOrEqual(exception.ratio - 0.005)
          continue
        }

        expect(
          ratio,
          `${scope.id} · ${pair.id} = ${ratio.toFixed(2)}:1, abaixo do mínimo ${min}:1`,
        ).toBeGreaterThanOrEqual(min)
      }
    }

    console.log(`\n${formatTable(rows)}\n`)
  })
})
