/**
 * Parser da fonte 365scores (JSON sem key) para xG e cartões por partida.
 *
 * Escolha da fonte (2026-11-07): FBref/SofaScore/FotMob estão atrás de
 * Cloudflare ("Just a moment") para clientes sem navegador; a API pública
 * 365scores responde JSON estável com:
 *  - xG por chute em `game.chartEvents.events[].xg` (competitorNum 1=mandante, 2=visitante);
 *  - cartões em `game.events[]` (`eventType.name` "Yellow Card"/"Red Card" + `competitorId`);
 *  - lista paginada de resultados em `/web/games/results/` (`paging.previousPage`).
 *
 * Validação feita contra o nosso dataset na adesão: 339/339 pares ordenados
 * e placares idênticos aos resultados empacotados.
 */

// Nomes da API 365scores → slug do projeto (mesma convenção do ESPN_NAME_SLUGS).
export const CLUB_NAME_SLUGS = {
  'Flamengo': 'flamengo',
  'Palmeiras': 'palmeiras',
  'Cruzeiro': 'cruzeiro',
  'Fluminense': 'fluminense',
  'Athletico Paranaense': 'athletico-pr',
  'Bahia': 'bahia',
  'Atlético Mineiro': 'atletico-mg',
  'RB Bragantino': 'bragantino',
  'Santos': 'santos',
  'São Paulo': 'sao-paulo',
  'Coritiba': 'coritiba',
  'Mirassol': 'mirassol',
  'Botafogo': 'botafogo',
  'Vasco da Gama': 'vasco',
  'Vitoria': 'vitoria',
  'Internacional': 'internacional',
  'Gremio': 'gremio',
  'Corinthians': 'corinthians',
  'Remo': 'remo',
  'Chapecoense': 'chapecoense',
}

function clubSlug(name) {
  const slug = CLUB_NAME_SLUGS[name]
  if (!slug) throw new Error(`Nome 365scores sem slug conhecido: ${name}`)
  return slug
}

function clubSlugOrNull(name) {
  return CLUB_NAME_SLUGS[name] ?? null
}

/**
 * Uma página da lista de resultados → jogos normalizados (qualquer temporada:
 * a paginação da fonte vaza temporadas antigas, então slugs desconhecidos de
 * outras temporadas viram null em vez de abortar; a guarda estrita acontece
 * depois do filtro por temporada, em `filterCurrentSeason`).
 */
export function parseResultsPage(jsonText) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  const games = payload?.games
  if (!Array.isArray(games)) throw new Error('Resposta 365scores sem lista de jogos.')
  return games.map((game) => {
    const home = game.homeCompetitor
    const away = game.awayCompetitor
    if (!home || !away) throw new Error(`Jogo ${game.id} sem mandante/visitante.`)
    const ended = game.statusText === 'Ended' && Number.isFinite(Number(home.score)) && Number.isFinite(Number(away.score))
    return {
      gameId: game.id,
      seasonNum: game.seasonNum,
      roundNum: Number(game.roundNum) || 0,
      home: clubSlugOrNull(home.name),
      away: clubSlugOrNull(away.name),
      homeScore: ended ? Number(home.score) : null,
      awayScore: ended ? Number(away.score) : null,
      ended,
      startTime: game.startTime ?? null,
    }
  })
}

/**
 * Jogos da temporada corrente com slugs resolvidos — nomes sem mapa na
 * temporada ATUAL são erro de publicação, não dado ignorável.
 */
export function filterCurrentSeason(games, seasonNum) {
  return games
    .filter((game) => game.seasonNum === seasonNum)
    .map((game) => {
      if (game.home == null || game.away == null) throw new Error(`Jogo da temporada ${seasonNum} com clube sem slug: ${game.gameId}.`)
      return game
    })
}

/** Temporada atual = a com mais jogos encerrados cujo kickoff é no ano de referência. */
export function currentSeasonNum(pages, referenceYear) {
  const votes = new Map()
  for (const game of pages.flat()) {
    if (!game.ended || !game.startTime?.startsWith(String(referenceYear))) continue
    votes.set(game.seasonNum, (votes.get(game.seasonNum) ?? 0) + 1)
  }
  let best = null
  for (const [seasonNum, count] of votes) {
    if (!best || count > best.count) best = { seasonNum, count }
  }
  if (!best) throw new Error(`Nenhum jogo encerrado em ${referenceYear} para identificar a temporada.`)
  return best.seasonNum
}

/** Detalhe do jogo → xG somado por mando e cartões por clube. */
export function parseGameDetail(jsonText) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  const game = payload?.game
  if (!game) throw new Error('Detalhe 365scores sem objeto game.')
  const homeId = game.homeCompetitor?.id
  const awayId = game.awayCompetitor?.id
  if (!homeId || !awayId) throw new Error(`Jogo ${game.id} sem ids de clubes.`)

  let xgHome = 0
  let xgAway = 0
  let shotsHome = 0
  let shotsAway = 0
  let hasXg = false
  const shots = game.chartEvents?.events ?? []
  for (const shot of shots) {
    // Placeholder "-" e nulls existem na fonte; só valores numéricos contam
    // (Number(null) === 0, então o null precisa ser filtrado antes).
    if (shot.xg == null || shot.xg === '') continue
    const value = Number(shot.xg)
    if (!Number.isFinite(value)) continue
    if (value < 0 || value > 10) throw new Error(`xG implausível no jogo ${game.id}: ${shot.xg}`)
    hasXg = true
    if (shot.competitorNum === 1) { xgHome += value; shotsHome += 1 } else if (shot.competitorNum === 2) { xgAway += value; shotsAway += 1 }
  }

  let yellowHome = 0
  let yellowAway = 0
  let redHome = 0
  let redAway = 0
  for (const event of game.events ?? []) {
    const name = event.eventType?.name ?? ''
    const isHome = event.competitorId === homeId
    const isAway = event.competitorId === awayId
    if (!isHome && !isAway) continue
    if (name === 'Yellow Card') { if (isHome) yellowHome += 1; else yellowAway += 1 } else if (name === 'Red Card') { if (isHome) redHome += 1; else redAway += 1 }
  }

  return {
    gameId: game.id,
    seasonNum: game.seasonNum,
    roundNum: Number(game.roundNum) || 0,
    home: clubSlug(game.homeCompetitor.name),
    away: clubSlug(game.awayCompetitor.name),
    homeScore: Number(game.homeCompetitor.score),
    awayScore: Number(game.awayCompetitor.score),
    hasXg,
    xgHome: hasXg ? Math.round(xgHome * 100) / 100 : null,
    xgAway: hasXg ? Math.round(xgAway * 100) / 100 : null,
    shotsHome,
    shotsAway,
    yellowHome,
    yellowAway,
    redHome,
    redAway,
  }
}

/** Tabelas agregadas de cartões por clube (cross-check da soma por jogo). */
export function parseStatsCards(jsonText) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  const tables = payload?.stats?.competitorsStats?.tables ?? []
  const cardsByClub = new Map()
  const take = (table) => {
    for (const row of table?.rows ?? []) {
      const name = row.entity?.name
      if (!name) continue
      const slug = clubSlug(name)
      const entry = cardsByClub.get(slug) ?? { yellow: 0, red: 0 }
      for (const stat of row.stats ?? []) {
        if (stat.typeId === 8) entry.yellow = Number(stat.value)
        if (stat.typeId === 10) entry.red = Number(stat.value)
      }
      cardsByClub.set(slug, entry)
    }
  }
  for (const table of tables) {
    if (table.name === 'Red Cards' || table.name === 'Yellow Cards') take(table)
  }
  if (cardsByClub.size === 0) throw new Error('Tabelas de cartões ausentes na resposta 365scores.')
  return cardsByClub
}

/** Fusão incremental: registros existentes têm precedência; novos entram por gameId. */
export function mergeAdvancedStats(existing, incoming) {
  const byId = new Map(existing.map((record) => [record.gameId, record]))
  for (const record of incoming) byId.set(record.gameId, { ...byId.get(record.gameId), ...record })
  return [...byId.values()].sort((left, right) => left.gameId - right.gameId)
}

/**
 * Sanidade dos agregados: pares únicos, placares coerentes e xG da temporada
 * próximo do total de gols (efeito de recuperação do xG — ΣxG/Σgols ≈ 1).
 * Não-publicação se falhar: dado avançado ruim não vai para o bundle.
 */
export function validateAdvancedStats(records, { expectedMatches, xgTolerance = 0.25 } = {}) {
  const seenPairs = new Map()
  let goals = 0
  let xg = 0
  let withXg = 0
  let cards = 0
  for (const record of records) {
    const pair = `${record.home}|${record.away}`
    if (seenPairs.has(pair)) throw new Error(`Par ordenado duplicado nos registros avançados: ${pair}`)
    seenPairs.set(pair, record)
    if (record.homeScore == null || record.awayScore == null) throw new Error(`Jogo ${record.gameId} sem placar.`)
    goals += record.homeScore + record.awayScore
    if (record.xgHome != null && record.xgAway != null) { xg += record.xgHome + record.xgAway; withXg += 1 }
    cards += record.yellowHome + record.yellowAway + record.redHome + record.redAway
    for (const field of ['yellowHome', 'yellowAway', 'redHome', 'redAway']) {
      if (!Number.isInteger(record[field]) || record[field] < 0) throw new Error(`Cartão inválido (${field}) no jogo ${record.gameId}: ${record[field]}`)
    }
  }
  if (expectedMatches != null && records.length !== expectedMatches) {
    throw new Error(`Registros avançados ${records.length} ≠ jogos disputados ${expectedMatches}.`)
  }
  if (withXg > 0 && Math.abs(xg - goals) / Math.max(1, goals) > xgTolerance) {
    throw new Error(`ΣxG ${xg.toFixed(2)} divergiu de Σgols ${goals} além da tolerância ${xgTolerance * 100}%.`)
  }
  if (cards === 0) throw new Error('Nenhum cartão nos agregados — fonte mudou de formato?')
  return { matches: records.length, withXg, goals, xg: Math.round(xg * 100) / 100, cards, xgRatio: Math.round((xg / Math.max(1, goals)) * 1000) / 1000 }
}

/** Módulo TS gerado (src/advancedStats2026.ts) — regenerado a cada coleta. */
export function renderAdvancedStatsModule({ records, fetchedAt, sourceSha, seasonNum }) {
  const lines = records.map((record) => {
    const xgHome = record.xgHome == null ? 'null' : record.xgHome.toFixed(2)
    const xgAway = record.xgAway == null ? 'null' : record.xgAway.toFixed(2)
    return `  { gameId: ${record.gameId}, round: ${record.roundNum}, home: '${record.home}', away: '${record.away}', homeScore: ${record.homeScore}, awayScore: ${record.awayScore}, xgHome: ${xgHome}, xgAway: ${xgAway}, yellowHome: ${record.yellowHome}, yellowAway: ${record.yellowAway}, redHome: ${record.redHome}, redAway: ${record.redAway} },`
  })
  return `/**
 * Dados avançados 2026 (xG por jogo e cartões) — GERADO por
 * scripts/backfill-xg-cards.mjs a partir da API pública 365scores.
 * NÃO EDITAR À MÃO: regenerado a cada atualização pós-rodada.
 *
 * Fonte validada contra os resultados empacotados (pares ordenados únicos e
 * placares idênticos); ΣxG é auditado contra Σgols em cada coleta.
 */

export interface AdvancedMatchRecord {
  gameId: number
  round: number
  home: string
  away: string
  homeScore: number
  awayScore: number
  /** xG somado dos chutes do mando; null quando o jogo não tem cobertura de xG. */
  xgHome: number | null
  xgAway: number | null
  yellowHome: number
  yellowAway: number
  redHome: number
  redAway: number
}

export const ADVANCED_STATS_SOURCE = {
  name: '365scores',
  seasonNum: ${seasonNum},
  fetchedAt: '${fetchedAt}',
  sha256: '${sourceSha}',
} as const

export const advancedMatches: readonly AdvancedMatchRecord[] = [
${lines.join('\n')}
]
`
}
