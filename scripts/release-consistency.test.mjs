/**
 * Gate de consistência do release: o CHANGELOG é a fonte pública da versão e
 * não pode divergir do `package.json`. Sem literal de data: o formato é
 * verificado por regex e a validade pelo calendário real, então este teste
 * continua correto em qualquer release.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const CHANGELOG_FILE = join(ROOT, 'CHANGELOG.md')
const PACKAGE_FILE = join(ROOT, 'package.json')

const SEMVER_RE = /^\d+\.\d+\.\d+$/
const HEADING_RE = /^## \[([^\]]+)\](?: - (.+))?$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function readChangelog() {
  return readFileSync(CHANGELOG_FILE, 'utf8')
}

function releaseEntries(markdown) {
  const entries = []
  for (const line of markdown.split('\n')) {
    const match = HEADING_RE.exec(line)
    if (match) entries.push({ version: match[1], date: match[2] ?? null })
  }
  return entries
}

function isValidDate(value) {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

describe('consistência de release', () => {
  it('o CHANGELOG existe e declara [Unreleased]', () => {
    const entries = releaseEntries(readChangelog())
    expect(entries.map((entry) => entry.version)).toContain('Unreleased')
  })

  it('a primeira versão publicada é a versão do package.json', () => {
    const { version } = JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'))
    const firstRelease = releaseEntries(readChangelog()).find((entry) => entry.version !== 'Unreleased')
    expect(firstRelease).toBeDefined()
    expect(firstRelease.version).toBe(version)
  })

  it('todo heading versionado é semver x.y.z', () => {
    const versions = releaseEntries(readChangelog())
      .map((entry) => entry.version)
      .filter((version) => version !== 'Unreleased')
    expect(versions.length).toBeGreaterThan(0)
    for (const version of versions) expect(version).toMatch(SEMVER_RE)
  })

  it('toda versão publicada tem data YYYY-MM-DD válida', () => {
    const releases = releaseEntries(readChangelog()).filter((entry) => entry.version !== 'Unreleased')
    for (const release of releases) {
      expect(release.date).not.toBeNull()
      expect(isValidDate(release.date)).toBe(true)
    }
  })
})
