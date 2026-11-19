/**
 * O shell estático precisa funcionar antes de qualquer módulo React existir:
 * um chunk lazy que falha não pode deixar a tela em branco (T07) e o tema
 * salvo precisa valer no primeiro paint, sem flash claro (T08).
 * Este teste lê `index.html` como texto — nada de literal de data ou de dados.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8')

const SCRIPT_BLOCKS = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]

function scriptIndex(predicate) {
  const index = SCRIPT_BLOCKS.findIndex(predicate)
  return index === -1 ? null : index
}

function themeScriptBody() {
  const block = SCRIPT_BLOCKS.find((match) => match[2].includes('br2026-theme'))
  expect(block, 'index.html deve ter um script inline de tema').toBeDefined()
  return block[2]
}

/** Executa o corpo do script inline com um `localStorage` controlado. */
function applyInlineTheme(storage) {
  document.documentElement.removeAttribute('data-theme')
  const run = new Function('localStorage', themeScriptBody())
  run(storage)
  return document.documentElement.dataset.theme
}

describe('shell estático do index.html', () => {
  it('mantém um status de carregamento dentro do #root', () => {
    const rootStart = HTML.indexOf('<div id="root">')
    expect(rootStart).toBeGreaterThanOrEqual(0)

    const rootEnd = HTML.indexOf('</div>', rootStart)
    expect(rootEnd).toBeGreaterThan(rootStart)
    const rootContent = HTML.slice(rootStart, rootEnd)

    expect(rootContent).toContain('role="status"')
    expect(rootContent).toContain('Carregando painel')
  })

  it('aplica o tema salvo antes do bundle e antes do CSS', () => {
    const themeScript = scriptIndex((match) => match[2].includes('br2026-theme'))
    expect(themeScript, 'script inline de tema ausente').not.toBeNull()

    const themeIndex = SCRIPT_BLOCKS[themeScript].index
    const stylesheetIndex = HTML.indexOf('rel="stylesheet"')
    const moduleScriptIndex = HTML.indexOf('<script type="module"')

    expect(stylesheetIndex).toBeGreaterThan(-1)
    expect(moduleScriptIndex).toBeGreaterThan(-1)
    expect(themeIndex).toBeLessThan(stylesheetIndex)
    expect(themeIndex).toBeLessThan(moduleScriptIndex)

    // Síncrono e minúsculo: nada de defer/async/type=module.
    expect(SCRIPT_BLOCKS[themeScript][1]).not.toMatch(/defer|async|type=/)
  })

  it('antecipa o tema a partir da mesma chave usada pelo React', () => {
    expect(themeScriptBody()).toContain('br2026-theme')
  })

  it('valida o valor salvo e cai em system quando o storage falha', () => {
    expect(applyInlineTheme({ getItem: () => 'dark' })).toBe('dark')
    expect(applyInlineTheme({ getItem: () => 'light' })).toBe('light')
    expect(applyInlineTheme({ getItem: () => 'system' })).toBe('system')
    expect(applyInlineTheme({ getItem: () => null })).toBe('system')
    expect(applyInlineTheme({ getItem: () => 'neon' })).toBe('system')
    expect(
      applyInlineTheme({
        getItem: () => {
          throw new Error('storage bloqueado')
        },
      }),
    ).toBe('system')
  })

  it('declara theme-color para os dois esquemas do sistema', () => {
    const themeColorTags = [...HTML.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)].map(
      (match) => match[0],
    )

    expect(themeColorTags).toHaveLength(2)
    expect(themeColorTags.some((tag) => tag.includes('media="(prefers-color-scheme: light)"'))).toBe(true)
    expect(themeColorTags.some((tag) => tag.includes('media="(prefers-color-scheme: dark)"'))).toBe(true)
  })
})
