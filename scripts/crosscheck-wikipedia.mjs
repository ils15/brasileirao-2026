/**
 * Cross-check offline e determinístico entre a camada canônica (OpenFootball,
 * CC0) e o sidecar de corroboração da Wikipédia (CC BY-SA 4.0).
 *
 * Uso:
 *   node scripts/crosscheck-wikipedia.mjs
 *
 * Saídas (ambas determinísticas, sem timestamps voláteis):
 *   reports/crosscheck-2003-2011.md
 *   reports/conflicts.json
 *
 * Divergência NUNCA altera src/historicalSeasons.ts e nunca é resolvida por
 * maioria, recência ou votação. A camada canônica permanece 100% OpenFootball.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOpenFootballSeason } from './pack-history.mjs'
import { EXPECTED_CLUBS } from './fetch-wikipedia-corroboration.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CANONICAL_DIR = join(root, 'data/source-snapshots/openfootball-br-2003-2011')
export const SIDECAR_DIR = join(root, 'data/corroboration/wikipedia')
export const REPORT_PATH = join(root, 'reports/crosscheck-2003-2011.md')
export const CONFLICTS_PATH = join(root, 'reports/conflicts.json')
export const SEASONS = [2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011]

function fail(message) {
  throw new Error(`crosscheck: ${message}`)
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Chave de pareamento com a matriz da Wikipédia. A matriz não traz data e só
 * traz rodada em 2007; por isso o pareamento usa (temporada, mandante,
 * visitante) na direção do mando. Pares repetidos (replays) permanecem
 * entradas distintas e nunca são deduplicados por par de clubes.
 */
export function fixtureKey(season, match) {
  return `${season}|${match.home}|${match.away}`
}

/**
 * Identidade própria de um fixture canônico, usada para provar que replays não
 * foram colapsados: (temporada, rodada, data, mandante, visitante).
 */
export function canonicalFixtureIdentity(season, match) {
  return `${season}|${match.round}|${match.date}|${match.home}|${match.away}`
}

/** Carrega e valida o sidecar versionado; qualquer adulteração é fatal. */
export function loadSidecar(dir = SIDECAR_DIR) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  if (manifest.license !== 'CC-BY-SA-4.0') fail('licença inesperada no manifest.json')
  const seasons = new Map()
  for (const year of SEASONS) {
    const text = readFileSync(join(dir, `${year}.json`), 'utf8')
    const expectedHash = manifest.seasons?.[year]?.sha256
    if (!expectedHash) fail(`manifest.json sem hash para ${year}`)
    if (sha256(text) !== expectedHash) fail(`sidecar ${year}.json diverge do manifest.json`)
    const document = JSON.parse(text)
    if (document.season !== year) fail(`sidecar ${year}.json declara temporada ${document.season}`)
    if (!['corroborated', 'not_corroborated', 'corroboration_unavailable'].includes(document.status)) {
      fail(`status inválido em ${year}.json: ${document.status}`)
    }
    if (!Array.isArray(document.matches)) fail(`matches ausente em ${year}.json`)
    if (document.status !== 'corroborated' && document.matches.length > 0) {
      fail(`${year}.json tem status ${document.status} mas contém placares`)
    }
    if (!document.provenance || document.provenance.license !== 'CC-BY-SA-4.0') {
      fail(`proveniência/licença ausente em ${year}.json`)
    }
    if (document.provenance.oldid == null) fail(`${year}.json sem oldid; não é possível citar a revisão`)
    if (!document.provenance.retrieved_at || !/Z$/.test(document.provenance.retrieved_at)) {
      fail(`${year}.json sem retrieved_at em UTC`)
    }
    if (document.status === 'corroborated') {
      const clubs = new Set()
      for (const match of document.matches) {
        if (typeof match.home !== 'string' || typeof match.away !== 'string' || !match.home || !match.away) {
          fail(`${year}.json com clube ausente`)
        }
        if (match.home === match.away) fail(`${year}.json com autoconfronto: ${match.home}`)
        for (const value of [match.homeGoals, match.awayGoals]) {
          if (!Number.isInteger(value) || value < 0) fail(`${year}.json com placar inválido em ${match.home} × ${match.away}`)
        }
        clubs.add(match.home)
        clubs.add(match.away)
      }
      const expectedClubs = EXPECTED_CLUBS.get(year)
      if (clubs.size !== expectedClubs) fail(`${year}.json com ${clubs.size} clubes; esperados ${expectedClubs}`)
      if (document.matches.length !== expectedClubs * (expectedClubs - 1)) {
        fail(`${year}.json com ${document.matches.length} partidas; esperadas ${expectedClubs * (expectedClubs - 1)}`)
      }
    }
    seasons.set(year, document)
  }
  return { manifest, seasons }
}

/** Carrega a fonte canônica (snapshot OpenFootball) de uma temporada. */
export function loadCanonicalSeason(year, dir = CANONICAL_DIR) {
  return parseOpenFootballSeason(readFileSync(join(dir, `${year}.txt`), 'utf8'), year)
}

/**
 * Compara uma temporada. Retorna contagens, divergências e fixtures presentes
 * em apenas uma fonte. Não escolhe nem corrige valores.
 */
export function crosscheckSeason(year, canonicalMatches, document) {
  const provenance = document.provenance
  const base = {
    year,
    status: document.status,
    statusReason: document.statusReason,
    provenance,
    compared: 0,
    coincidences: [],
    divergences: [],
    onlyOpenFootball: [],
    onlyWikipedia: [],
    ambiguities: [],
  }
  if (document.status !== 'corroborated') {
    if (canonicalMatches.length === 0) fail(`snapshot canônico vazio em ${year}`)
    return base
  }

  const index = new Map()
  for (const match of canonicalMatches) {
    const key = fixtureKey(year, match)
    index.set(key, [...(index.get(key) ?? []), match])
  }
  const referenced = new Set()
  const wikipediaMatches = [...document.matches].sort((left, right) =>
    left.home.localeCompare(right.home)
    || left.away.localeCompare(right.away)
    || (left.round ?? 0) - (right.round ?? 0))

  for (const wikipedia of wikipediaMatches) {
    const directKey = `${year}|${wikipedia.home}|${wikipedia.away}`
    const direct = index.get(directKey) ?? []
    if (direct.length === 1) {
      const openfootball = direct[0]
      referenced.add(openfootball.sourceOrdinal)
      base.compared += 1
      if (openfootball.homeGoals === wikipedia.homeGoals && openfootball.awayGoals === wikipedia.awayGoals) {
        base.coincidences.push({ openfootball, wikipedia })
      } else {
        base.divergences.push({
          id: `${year}-${wikipedia.home}-${wikipedia.away}-${openfootball.sourceOrdinal}`,
          season: year,
          fixture: {
            home: wikipedia.home,
            away: wikipedia.away,
            round: openfootball.round,
            date: openfootball.date,
            sourceOrdinal: openfootball.sourceOrdinal,
          },
          openfootball: { homeGoals: openfootball.homeGoals, awayGoals: openfootball.awayGoals },
          wikipedia: {
            homeGoals: wikipedia.homeGoals,
            awayGoals: wikipedia.awayGoals,
            round: wikipedia.round,
            article: provenance.article,
            oldid: provenance.oldid,
            permalink: provenance.permalink,
          },
          status: 'open',
          resolution: null,
          evidence: [
            `data/source-snapshots/openfootball-br-2003-2011/${year}.txt, ordinal ${openfootball.sourceOrdinal}: `
              + `${openfootball.home} ${openfootball.homeGoals}–${openfootball.awayGoals} ${openfootball.away} `
              + `(rodada ${openfootball.round}, ${openfootball.date})`,
            `en.wikipedia.org "${provenance.article}" oldid ${provenance.oldid}, `
              + `match_${wikipedia.homeCode}_${wikipedia.awayCode} = `
              + `${wikipedia.homeGoals}–${wikipedia.awayGoals}`,
          ],
        })
      }
      continue
    }
    if (direct.length > 1) {
      for (const match of direct) referenced.add(match.sourceOrdinal)
      base.ambiguities.push({
        kind: 'duplicate_directed_fixture',
        message: `OpenFootball tem ${direct.length} fixtures ${wikipedia.home} × ${wikipedia.away}; a matriz da Wikipédia não traz data/rodada suficiente para desambiguar.`,
        wikipedia,
        candidates: direct,
      })
      continue
    }
    const reverse = index.get(`${year}|${wikipedia.away}|${wikipedia.home}`) ?? []
    if (reverse.length > 0) {
      for (const match of reverse) referenced.add(match.sourceOrdinal)
      base.ambiguities.push({
        kind: 'venue_mismatch',
        message: `Wikipédia registra ${wikipedia.home} × ${wikipedia.away}, mas o OpenFootball só tem o mando invertido. Nenhum placar foi comparado.`,
        wikipedia,
        candidates: reverse,
      })
      continue
    }
    base.onlyWikipedia.push(wikipedia)
  }

  base.onlyOpenFootball = canonicalMatches.filter((match) => !referenced.has(match.sourceOrdinal))
  return base
}

/** Executa o cross-check completo sobre os arquivos versionados. */
export function crosscheckAll({ canonicalDir = CANONICAL_DIR, sidecarDir = SIDECAR_DIR } = {}) {
  const { manifest, seasons } = loadSidecar(sidecarDir)
  const results = []
  for (const year of SEASONS) {
    const document = seasons.get(year)
    const canonicalMatches = loadCanonicalSeason(year, canonicalDir)
    const identities = canonicalMatches.map((match) => canonicalFixtureIdentity(year, match))
    if (new Set(identities).size !== identities.length) {
      fail(`${year}: fixture canônico duplicado por (rodada, data, mandante, visitante)`)
    }
    if (document.status === 'corroborated') {
      if (document.matches.length !== EXPECTED_CLUBS.get(year) * (EXPECTED_CLUBS.get(year) - 1)) {
        fail(`${year}: contagem de partidas da Wikipédia inesperada`)
      }
    }
    results.push(crosscheckSeason(year, canonicalMatches, document))
  }
  return { manifest, results }
}

function signedScore(score) {
  return `${score.homeGoals}–${score.awayGoals}`
}

function seasonHeading(result) {
  const label = result.status === 'corroborated'
    ? 'corroborada'
    : result.status === 'not_corroborated' ? 'não corroborada' : 'corroboração indisponível'
  return `### ${result.year} — ${label}`
}

function renderSeason(result) {
  const lines = [seasonHeading(result), '']
  lines.push(`- Artigo: [${result.provenance.article}](${result.provenance.permalink}) — oldid \`${result.provenance.oldid}\`.`)
  if (result.status !== 'corroborated') {
    lines.push(`- Partidas comparadas: 0. Motivo: ${result.statusReason}`)
    lines.push('')
    return lines.join('\n')
  }
  lines.push(`- Partidas comparadas: ${result.compared}`)
  lines.push(`- Coincidências: ${result.coincidences.length}`)
  lines.push(`- Divergências: ${result.divergences.length}`)
  lines.push(`- Identidade ambígua (não comparadas): ${result.ambiguities.length}`)
  lines.push(`- Só no OpenFootball: ${result.onlyOpenFootball.length}`)
  lines.push(`- Só na Wikipédia: ${result.onlyWikipedia.length}`)
  lines.push('')

  if (result.divergences.length > 0) {
    lines.push('| Mandante | Visitante | Rodada | Data | OpenFootball | Wikipédia | oldid |')
    lines.push('|---|---|---:|---|---|---|---|')
    for (const divergence of result.divergences) {
      lines.push(`| ${divergence.fixture.home} | ${divergence.fixture.away} | ${divergence.fixture.round} | ${divergence.fixture.date} | `
        + `OF=${signedScore(divergence.openfootball)} | WP=${signedScore(divergence.wikipedia)} | ${divergence.wikipedia.oldid} |`)
    }
    lines.push('')
  }

  if (result.onlyOpenFootball.length > 0) {
    lines.push('Fixtures só no OpenFootball:')
    for (const match of result.onlyOpenFootball) {
      lines.push(`- ${match.home} ${signedScore(match)} ${match.away} (rodada ${match.round}, ${match.date}, ordinal ${match.sourceOrdinal}).`)
    }
    lines.push('')
  }
  if (result.onlyWikipedia.length > 0) {
    lines.push('Fixtures só na Wikipédia:')
    for (const match of result.onlyWikipedia) {
      lines.push(`- ${match.home} ${signedScore(match)} ${match.away}${match.round == null ? '' : ` (rodada ${match.round})`}.`)
    }
    lines.push('')
  }
  if (result.ambiguities.length > 0) {
    lines.push('Identidade ambígua (reportada, nunca deduplicada por par de clubes):')
    for (const ambiguity of result.ambiguities) {
      lines.push(`- ${ambiguity.message} Candidatos: `
        + ambiguity.candidates.map((match) => `${match.home} ${signedScore(match)} ${match.away} (R${match.round}, ${match.date})`).join('; ')
        + '.')
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Relatório Markdown determinístico. */
export function renderReport({ manifest, results }) {
  const lines = [
    '# Cross-check OpenFootball × Wikipédia (2003–2011)',
    '',
    'Comparação offline e determinística entre a camada canônica (**OpenFootball, CC0**) e a',
    'camada de **corroboração secundária** extraída da Wikipédia em inglês (**CC BY-SA 4.0**).',
    'A camada de corroboração não é consumida pelo runtime; nenhum placar canônico é alterado.',
    '',
    '## Política de conflito',
    '',
    '- O valor canônico é sempre o do OpenFootball; divergência não altera `src/historicalSeasons.ts`.',
    '- Divergências ficam com `status: "open"` em `reports/conflicts.json` e não são resolvidas por',
    '  maioria, recência ou votação. Resolução exige evidência primária e revisão humana.',
    '- Coincidência entre as duas fontes é corroboração secundária, não validação primária.',
    '',
    '## Identidade de fixture',
    '',
    'A matriz da Wikipédia não fornece datas (e fornece rodada apenas em 2007), então o pareamento',
    'usa `(temporada, mandante, visitante)` na direção do mando. Quando o OpenFootball tem mais de',
    'um fixture com o mesmo mandante e visitante — replays de 2005 — as entradas permanecem',
    'separadas e o caso é reportado como identidade ambígua; não há deduplicação por par de clubes.',
    '',
    '## Resumo',
    '',
    '| Temporada | Status | oldid | Comparadas | Coincidências | Divergências | Só OF | Só WP | Ambíguas |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const result of results) {
    lines.push(`| ${result.year} | ${result.status} | ${result.provenance.oldid} | ${result.compared} | `
      + `${result.coincidences.length} | ${result.divergences.length} | ${result.onlyOpenFootball.length} | `
      + `${result.onlyWikipedia.length} | ${result.ambiguities.length} |`)
  }
  const totals = results.reduce((accumulator, result) => ({
    compared: accumulator.compared + result.compared,
    coincidences: accumulator.coincidences + result.coincidences.length,
    divergences: accumulator.divergences + result.divergences.length,
    ambiguities: accumulator.ambiguities + result.ambiguities.length,
  }), { compared: 0, coincidences: 0, divergences: 0, ambiguities: 0 })
  lines.push(`| **Total** | — | — | ${totals.compared} | ${totals.coincidences} | ${totals.divergences} | — | — | ${totals.ambiguities} |`)
  lines.push('')

  lines.push('## 2003 excluída do cross-check', '')
  lines.push(results.find((result) => result.year === 2003).statusReason)
  lines.push('')

  lines.push('## Detalhe por temporada', '')
  for (const result of results) {
    lines.push(renderSeason(result))
  }

  lines.push('## Limitações', '')
  lines.push('- A Wikipédia é fonte secundária, editável e sem revisão editorial garantida; oldids fixam apenas o texto consultado.')
  lines.push('- Não existe fonte aberta independente e licenciada para todos os placares de 2003–2011; a camada canônica continua sendo uma única fonte (OpenFootball).')
  lines.push('- 2004, 2005 e 2008 não têm matriz de resultados na revisão fixada do artigo em inglês; nenhum placar foi inventado.')
  lines.push('- A matriz não traz data nem estádio, então divergências de mando aparecem como identidade ambígua, não como conflito de placar.')
  lines.push('')
  return lines.join('\n')
}

/** JSON de conflitos, contendo apenas divergências de placar e questões de identidade. */
export function renderConflicts({ manifest, results }) {
  const conflicts = results.flatMap((result) => result.divergences.map((divergence) => ({
    id: divergence.id,
    season: divergence.season,
    status: divergence.status,
    resolution: divergence.resolution,
    fixture: divergence.fixture,
    openfootball: divergence.openfootball,
    wikipedia: divergence.wikipedia,
    evidence: divergence.evidence,
  })))
  const identityIssues = results.flatMap((result) => result.ambiguities.map((ambiguity) => ({
    season: result.year,
    kind: ambiguity.kind,
    message: ambiguity.message,
    wikipedia: ambiguity.wikipedia,
    candidates: ambiguity.candidates.map((match) => ({
      home: match.home,
      away: match.away,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      round: match.round,
      date: match.date,
      sourceOrdinal: match.sourceOrdinal,
    })),
  })))
  return {
    schemaVersion: 1,
    canonical: {
      source: 'OpenFootball',
      fork: 'jackdepaula/br-brazil',
      license: 'CC0-1.0',
      directory: 'data/source-snapshots/openfootball-br-2003-2011',
    },
    secondary: {
      source: 'English Wikipedia',
      license: manifest.license,
      directory: 'data/corroboration/wikipedia',
      consumedByRuntime: false,
    },
    policy: {
      canonicalValueRetained: true,
      resolutionRule: 'Divergências não são resolvidas por maioria, recência ou votação; permanecem abertas para revisão humana com evidência primária.',
      runtimeConsumption: 'O runtime não lê a camada de corroboração.',
    },
    totals: {
      conflicts: conflicts.length,
      open: conflicts.filter((conflict) => conflict.status === 'open').length,
      resolved: conflicts.filter((conflict) => conflict.status === 'resolved').length,
      identityIssues: identityIssues.length,
    },
    conflicts,
    identityIssues,
  }
}

function main() {
  const bundle = crosscheckAll()
  const report = renderReport(bundle)
  const conflicts = `${JSON.stringify(renderConflicts(bundle), null, 2)}\n`
  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, report)
  writeFileSync(CONFLICTS_PATH, conflicts)
  const totals = bundle.results.reduce((accumulator, result) => ({
    compared: accumulator.compared + result.compared,
    divergences: accumulator.divergences + result.divergences.length,
  }), { compared: 0, divergences: 0 })
  console.log(`Cross-check: ${totals.compared} partidas comparadas, ${totals.divergences} divergências, ${bundle.results.reduce((sum, result) => sum + result.ambiguities.length, 0)} ambiguidades.`)
  console.log(`Relatório: ${REPORT_PATH}`)
  console.log(`Conflitos: ${CONFLICTS_PATH}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
