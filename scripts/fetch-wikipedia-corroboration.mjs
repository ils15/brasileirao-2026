/**
 * Gera o sidecar de corroboração da Wikipédia (CC BY-SA 4.0) para 2003–2011.
 *
 * Ferramenta de desenvolvimento, dependente de rede; NÃO é executada por testes,
 * build ou runtime. Os JSON resultantes são versionados e imutáveis: a revisão
 * de cada artigo é fixada por `oldid` (permalink) e o conteúdo só muda com uma
 * nova execução explícita deste script.
 *
 * Uso:
 *   node scripts/fetch-wikipedia-corroboration.mjs
 *
 * O extrator lê os parâmetros `match_<mandante>_<visitante>` do módulo
 * Module:Sports results, onde o primeiro código é o mandante. Não há datas na
 * matriz; a identidade usada pelo cross-check é (temporada, mandante, visitante).
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { historicalSlugs, normalizeName } from './pack-history.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIR = join(root, 'data/corroboration/wikipedia')
const API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'BrasileiraoHistoryCorroboration/1.0 (dados abertos; contato: mantenedor local)'
const LICENSE_ID = 'CC-BY-SA-4.0'
const LICENSE_FILE = 'data/corroboration/wikipedia/LICENSE'

export const EXPECTED_CLUBS = new Map([
  [2003, 24], [2004, 24], [2005, 22],
  ...Array.from({ length: 6 }, (_, index) => [2006 + index, 20]),
])

/**
 * Revisões fixadas. Cada entrada é o `oldid` do artigo em inglês no momento da
 * extração; o script falha se a API devolver outra revisão.
 */
export const PINNED_REVISIONS = {
  2003: { oldid: 1314521303, revisionTimestamp: '2025-10-01T21:29:13Z' },
  2004: { oldid: 1324706996, revisionTimestamp: '2025-11-29T05:01:22Z' },
  2005: { oldid: 1381069893, revisionTimestamp: '2026-10-19T20:33:49Z' },
  2006: { oldid: 1359651926, revisionTimestamp: '2026-06-16T12:35:04Z' },
  2007: { oldid: 1348483259, revisionTimestamp: '2026-04-12T23:00:48Z' },
  2008: { oldid: 1260520572, revisionTimestamp: '2024-12-01T06:23:30Z' },
  2009: { oldid: 1355029152, revisionTimestamp: '2026-05-19T14:55:06Z' },
  2010: { oldid: 1359651869, revisionTimestamp: '2026-06-16T12:34:42Z' },
  2011: { oldid: 1359650245, revisionTimestamp: '2026-06-16T12:21:44Z' },
}

export const SEASON_STATUS = {
  2003: 'not_corroborated',
  2004: 'corroboration_unavailable',
  2005: 'corroboration_unavailable',
  2006: 'corroborated',
  2007: 'corroborated',
  2008: 'corroboration_unavailable',
  2009: 'corroborated',
  2010: 'corroborated',
  2011: 'corroborated',
}

const STATUS_REASON = {
  2003: 'A seção "Results" do artigo está marcada com {{citation needed|date=October 2025}}. Sem citação verificável, a matriz não pode ser apresentada como corroborada e fica fora do cross-check.',
  2004: 'A revisão fixada do artigo não contém matriz de resultados casa/fora; há apenas classificação final e resumo. Nenhum placar foi extraído.',
  2005: 'A revisão fixada do artigo não contém matriz de resultados casa/fora; há apenas resumo, classificação final e estatísticas. Nenhum placar foi extraído.',
  2008: 'A revisão fixada do artigo não contém matriz de resultados casa/fora; há apenas tabela de classificação e elenco. Nenhum placar foi extraído.',
}

const MODIFICATIONS = [
  'Extração apenas dos parâmetros match_<mandante>_<visitante> do módulo Module:Sports results.',
  'Normalização dos nomes de clubes para os identificadores do projeto.',
  'Remoção de prosa, referências, classificação e demais seções do artigo.',
  'Anotações de rodada entre <sup> preservadas como campo opcional, sem uso na identidade do fixture.',
]

const WP_NAME_ALIASES = new Map([
  ['americamineiro', 'america-mg'],
  ['gremiobarueri', 'barueri'],
])

export function articleTitle(year) {
  return `${year} Campeonato Brasileiro Série A`
}

export function articleUrl(year) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle(year).replace(/ /g, '_'))}`
}

export function permalink(year) {
  return `https://en.wikipedia.org/w/index.php?oldid=${PINNED_REVISIONS[year].oldid}`
}

function fail(year, message) {
  throw new Error(`[${year}] ${message}`)
}

function stripNoise(value) {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

/** Extrai o nome exibido de um valor como `{{nowrap|[[Clube X|X]]}}`. */
export function displayNameOf(rawValue) {
  let value = rawValue.trim()
  while (/^\{\{nowrap\|/i.test(value)) {
    value = value.replace(/^\{\{nowrap\|/i, '').replace(/\}\}\s*$/, '')
  }
  const link = value.match(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/)
  if (link) return (link[2] ?? link[1]).trim()
  return value.replace(/'''?/g, '').trim()
}

function clubSlug(displayName, year) {
  const key = normalizeName(displayName)
  const slug = WP_NAME_ALIASES.get(key) ?? historicalSlugs.get(key)
  if (!slug) fail(year, `clube sem mapeamento para o projeto: "${displayName}"`)
  return slug
}

/**
 * Converte o wikitexto de uma temporada nas entradas da matriz casa/fora.
 * Qualquer valor de célula fora do formato esperado é erro fatal, nunca descarte.
 */
export function parseWikipediaResultsMatrix(wikitext, year) {
  const names = new Map()
  for (const line of wikitext.split(/\r?\n/)) {
    const match = line.match(/^\|\s*name_([A-Za-z0-9]+)\s*=\s*(.*?)\s*$/)
    if (match) names.set(match[1], displayNameOf(match[2]))
  }

  const matches = []
  for (const line of wikitext.split(/\r?\n/)) {
    const match = line.match(/^\|\s*match_([A-Za-z0-9]+)_([A-Za-z0-9]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const [, homeCode, awayCode, rawValue] = match
    const homeName = names.get(homeCode)
    const awayName = names.get(awayCode)
    if (!homeName || !awayName) fail(year, `código de clube sem name_: ${homeCode}/${awayCode}`)

    const value = stripNoise(rawValue)
    const roundMatch = value.match(/<sup>\s*\(R(\d+)\)\s*<\/sup>/)
    const withoutSup = value.replace(/<sup>[\s\S]*?<\/sup>/gi, '').trim()
    const unwrapped = withoutSup
      .replace(/\{\{nowrap\|([\s\S]*)\}\}/gi, '$1')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/<br\s*\/?>/gi, '')
      .trim()
    const score = unwrapped.match(/^(\d{1,2})\s*[–-]\s*(\d{1,2})$/)
    if (!score) fail(year, `placar não reconhecido em match_${homeCode}_${awayCode}: "${rawValue}"`)

    const home = clubSlug(homeName, year)
    const away = clubSlug(awayName, year)
    const homeGoals = Number(score[1])
    const awayGoals = Number(score[2])
    if (home === away) fail(year, `autoconfronto: ${home}`)
    if (!Number.isInteger(homeGoals) || homeGoals < 0 || !Number.isInteger(awayGoals) || awayGoals < 0) {
      fail(year, `placar inválido em match_${homeCode}_${awayCode}`)
    }
    matches.push({
      home,
      away,
      homeGoals,
      awayGoals,
      round: roundMatch ? Number(roundMatch[1]) : null,
      homeCode,
      awayCode,
    })
  }
  if (matches.length === 0) fail(year, 'nenhum par match_<casa>_<fora> encontrado.')
  return matches
}

/** Validação estrutural e aritmética; qualquer falha interrompe a geração. */
export function validateSeasonMatrix(matches, year) {
  const expectedClubs = EXPECTED_CLUBS.get(year)
  const clubs = [...new Set(matches.flatMap(({ home, away }) => [home, away]))].sort()
  const expectedMatches = expectedClubs * (expectedClubs - 1)
  if (clubs.length !== expectedClubs) {
    fail(year, `esperados ${expectedClubs} clubes, encontrados ${clubs.length}: ${clubs.join(', ')}`)
  }
  if (matches.length !== expectedMatches) {
    fail(year, `esperadas ${expectedMatches} partidas, encontradas ${matches.length}`)
  }
  const homeCount = new Map(clubs.map((club) => [club, 0]))
  const awayCount = new Map(clubs.map((club) => [club, 0]))
  const goalsForByClub = new Map(clubs.map((club) => [club, 0]))
  const goalsAgainstByClub = new Map(clubs.map((club) => [club, 0]))
  const directedPairs = new Set()
  const pairCounts = new Map()
  for (const match of matches) {
    if (match.home === match.away) fail(year, `autoconfronto: ${match.home}`)
    for (const value of [match.homeGoals, match.awayGoals]) {
      if (!Number.isInteger(value) || value < 0) fail(year, `placar não inteiro/negativo em ${match.home} × ${match.away}`)
    }
    const key = `${match.home}|${match.away}`
    if (directedPairs.has(key)) fail(year, `fixture direcionado duplicado: ${key}`)
    directedPairs.add(key)
    const pairKey = [match.home, match.away].sort().join('|')
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1)
    homeCount.set(match.home, homeCount.get(match.home) + 1)
    awayCount.set(match.away, awayCount.get(match.away) + 1)
    goalsForByClub.set(match.home, goalsForByClub.get(match.home) + match.homeGoals)
    goalsAgainstByClub.set(match.home, goalsAgainstByClub.get(match.home) + match.awayGoals)
    goalsForByClub.set(match.away, goalsForByClub.get(match.away) + match.awayGoals)
    goalsAgainstByClub.set(match.away, goalsAgainstByClub.get(match.away) + match.homeGoals)
  }
  const expectedPerClub = expectedClubs - 1
  const homeMismatch = [...homeCount.entries()].filter(([, count]) => count !== expectedPerClub)
  const awayMismatch = [...awayCount.entries()].filter(([, count]) => count !== expectedPerClub)
  if (homeMismatch.length) fail(year, `mando inconsistente: ${JSON.stringify(homeMismatch)}`)
  if (awayMismatch.length) fail(year, `visita inconsistente: ${JSON.stringify(awayMismatch)}`)
  const unevenPairs = [...pairCounts.entries()].filter(([, count]) => count !== 2)
  if (unevenPairs.length) fail(year, `pares sem ida e volta: ${JSON.stringify(unevenPairs)}`)
  const goalsFor = [...goalsForByClub.values()].reduce((sum, value) => sum + value, 0)
  const goalsAgainst = [...goalsAgainstByClub.values()].reduce((sum, value) => sum + value, 0)
  if (goalsFor !== goalsAgainst) fail(year, `Σ gols pró (${goalsFor}) ≠ Σ gols contra (${goalsAgainst})`)
  return {
    expectedClubs,
    clubs: clubs.length,
    expectedMatches,
    matches: matches.length,
    totalGoals: goalsFor,
    goalsFor,
    goalsAgainst,
    arithmeticConsistent: true,
    distinctDirectedFixtures: directedPairs.size,
  }
}

async function fetchRevision(year) {
  const { oldid, revisionTimestamp } = PINNED_REVISIONS[year]
  const url = new URL(API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('prop', 'revisions')
  url.searchParams.set('revids', String(oldid))
  url.searchParams.set('rvprop', 'ids|timestamp|sha1|content')
  url.searchParams.set('rvslots', 'main')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) fail(year, `HTTP ${response.status} ao consultar a Wikipédia`)
  const json = await response.json()
  const revision = json?.query?.pages?.[0]?.revisions?.[0]
  if (!revision) fail(year, `revisão ${oldid} não encontrada`)
  if (revision.revid !== oldid) fail(year, `revisão devolvida ${revision.revid} ≠ fixada ${oldid}`)
  if (revision.timestamp !== revisionTimestamp) {
    fail(year, `timestamp ${revision.timestamp} ≠ registrado ${revisionTimestamp}`)
  }
  const content = revision.slots?.main?.content
  if (typeof content !== 'string') fail(year, `conteúdo ausente na revisão ${oldid}`)
  return content
}

function windowBetweenRequests(ms = 2500) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function seasonDocument(year, { matches, validation, retrievedAt }) {
  const status = SEASON_STATUS[year]
  const document = {
    season: year,
    status,
    statusReason: STATUS_REASON[year] ?? null,
    matches,
    validation,
    provenance: {
      article: articleTitle(year),
      articleUrl: articleUrl(year),
      oldid: PINNED_REVISIONS[year].oldid,
      permalink: permalink(year),
      revisionTimestamp: PINNED_REVISIONS[year].revisionTimestamp,
      retrieved_at: retrievedAt,
      license: LICENSE_ID,
      licenseFile: LICENSE_FILE,
      modifications: MODIFICATIONS,
    },
  }
  return document
}

export function renderSeasonDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`
}

export function sha256Of(text) {
  return createHash('sha256').update(text).digest('hex')
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const manifest = {
    source: 'English Wikipedia (en.wikipedia.org)',
    license: LICENSE_ID,
    licenseFile: LICENSE_FILE,
    generatedBy: 'scripts/fetch-wikipedia-corroboration.mjs',
    seasons: {},
  }
  const retrievedAt = new Date().toISOString()

  for (let year = 2003; year <= 2011; year += 1) {
    const status = SEASON_STATUS[year]
    let matches = []
    let validation = {
      expectedClubs: EXPECTED_CLUBS.get(year),
      clubs: null,
      expectedMatches: null,
      matches: 0,
      goalsFor: null,
      goalsAgainst: null,
      arithmeticConsistent: null,
      distinctDirectedFixtures: null,
    }
    let content = null
    if (status === 'corroborated') {
      content = await fetchRevision(year)
      matches = parseWikipediaResultsMatrix(content, year)
      validation = validateSeasonMatrix(matches, year)
      await windowBetweenRequests()
    } else if (year === 2003) {
      content = await fetchRevision(year)
      if (!/citation needed/i.test(content)) {
        fail(year, 'a marcação {{citation needed}} não foi encontrada; reavaliar o status antes de publicar.')
      }
      await windowBetweenRequests()
    } else {
      content = await fetchRevision(year)
      if (/^\|\s*match_[A-Za-z0-9]+_[A-Za-z0-9]+\s*=/m.test(content)) {
        fail(year, 'uma matriz de resultados apareceu; reavaliar o status corroboration_unavailable.')
      }
      await windowBetweenRequests()
    }

    const document = seasonDocument(year, { matches, validation, retrievedAt })
    const text = renderSeasonDocument(document)
    writeFileSync(join(OUTPUT_DIR, `${year}.json`), text)
    manifest.seasons[year] = {
      file: `${year}.json`,
      sha256: sha256Of(text),
      status,
      oldid: PINNED_REVISIONS[year].oldid,
      matches: matches.length,
    }
    console.log(`${year}: ${status}, ${matches.length} partidas, oldid ${PINNED_REVISIONS[year].oldid}`)
  }

  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Sidecar gravado em ${OUTPUT_DIR}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
