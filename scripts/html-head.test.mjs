/**
 * O head do `index.html` é o primeiro contato com o navegador e não tem teste
 * de componente: favicon, cartão social e canonical vivem só no HTML estático.
 * Este teste lê o arquivo como texto e nomeia cada tag ausente, para que o
 * 404 de `/favicon.ico` (inclusive sob `/brasileirao-2026/`) não volte sem
 * ninguém notar.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HTML = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const PAGES_URL = 'https://ils15.github.io/brasileirao-2026/'

const LINK_TAGS = [...HTML.matchAll(/<link\b[^>]*>/g)].map((match) => match[0])
const META_TAGS = [...HTML.matchAll(/<meta\b[^>]*>/g)].map((match) => match[0])

function metaContent(attribute, value) {
  const tag = META_TAGS.find((candidate) => candidate.includes(`${attribute}="${value}"`))
  if (!tag) return null
  const content = tag.match(/content="([^"]*)"/)
  return content ? content[1] : null
}

function linkByRel(rel) {
  return LINK_TAGS.find((tag) => new RegExp(`\\brel="${rel}"`).test(tag)) ?? null
}

describe('head do index.html', () => {
  it('declara um favicon SVG em vez de deixar o navegador pedir /favicon.ico', () => {
    const icon = linkByRel('icon')
    expect(icon, 'index.html não declara link rel="icon"').not.toBeNull()
    expect(icon, 'favicon precisa ser type="image/svg+xml"').toContain('type="image/svg+xml"')
    expect(icon, 'favicon precisa apontar para favicon.svg').toMatch(/href="[^"]*favicon\.svg"/)
  })

  it('declara as quatro metas Open Graph com conteúdo', () => {
    const missing = []
    for (const property of ['og:title', 'og:description', 'og:type', 'og:url']) {
      if (!metaContent('property', property)) missing.push(property)
    }
    expect(missing, `metas Open Graph ausentes no index.html: ${missing.join(', ')}`).toEqual([])

    expect(metaContent('property', 'og:type')).toBe('website')
    expect(metaContent('property', 'og:url')).toBe(PAGES_URL)
  })

  it('mantém og:title igual ao <title>', () => {
    const title = HTML.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()
    expect(metaContent('property', 'og:title')).toBe(title)
  })

  it('declara o canonical do GitHub Pages', () => {
    const canonical = linkByRel('canonical')
    expect(canonical, 'index.html não declara link rel="canonical"').not.toBeNull()
    expect(canonical).toContain(`href="${PAGES_URL}"`)
  })

  it('declara color-scheme para os dois esquemas do sistema', () => {
    expect(metaContent('name', 'color-scheme')).toBe('light dark')
  })
})
