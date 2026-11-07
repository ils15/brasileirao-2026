/**
 * Parser da API Futebol BR (api.api-futebol.com.br, Bearer sem custos de
 * infraestrutura) para artilharia 2026 e cartões por partida.
 *
 * Escopo da fonte (sondado em nov/2026):
 *  - /v1/campeonatos/10/artilharia → goleadores da edição atual (sem assistências);
 *  - /v1/campeonatos/10/tabela     → classificação (0 divergências vs nossos placares na adesão);
 *  - /v1/partidas/{id}             → gols (sem assistência) e cartões por partida;
 *  - edições antigas NÃO têm rota — o histórico se constrói com os snapshots
 *    anuais que o próprio projeto acumula (§19 da auditoria).
 */

// Nomes da API Futebol BR → slug do projeto (tabela da Série A 2026).
export const TEAM_NAME_SLUGS = {
  'Flamengo': 'flamengo',
  'Palmeiras': 'palmeiras',
  'Cruzeiro': 'cruzeiro',
  'Fluminense': 'fluminense',
  'Athletico-PR': 'athletico-pr',
  'Bahia': 'bahia',
  'Atlético-MG': 'atletico-mg',
  'Bragantino': 'bragantino',
  'Santos': 'santos',
  'São Paulo': 'sao-paulo',
  'Coritiba': 'coritiba',
  'Mirassol': 'mirassol',
  'Botafogo': 'botafogo',
  'Vasco': 'vasco',
  'Vitória': 'vitoria',
  'Internacional': 'internacional',
  'Grêmio': 'gremio',
  'Corinthians': 'corinthians',
  'Remo': 'remo',
  'Chapecoense': 'chapecoense',
}

function teamSlug(name) {
  const slug = TEAM_NAME_SLUGS[name]
  if (!slug) throw new Error(`Nome de time da API Futebol BR sem slug conhecido: ${name}`)
  return slug
}

/** Artilharia da edição atual → [{name, club, goals}] ordenado por gols desc. */
export function parseScorers(jsonText, { minAthletes = 200 } = {}) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  if (!Array.isArray(payload) || payload.length < minAthletes) {
    throw new Error(`Artilharia inesperada: ${Array.isArray(payload) ? payload.length : typeof payload} atletas (esperado ≥ ${minAthletes}).`)
  }
  const scorers = payload.map((entry) => {
    const name = entry.atleta?.nome_popular
    const club = entry.time?.nome_popular
    const goals = entry.gols
    if (!name || !club || !Number.isInteger(goals) || goals < 0) {
      throw new Error(`Entrada de artilharia inválida: ${JSON.stringify(entry).slice(0, 120)}`)
    }
    return { name, club: teamSlug(club), goals }
  })
  scorers.sort((left, right) => right.goals - left.goals || left.name.localeCompare(right.name, 'pt-BR'))
  return scorers
}

/**
 * Classificação da API → agregados por slug, para conciliar com os placares
 * empacotados (a adesão fechou 20/20 clubes com 0 divergências).
 */
export function parseTable(jsonText, { expectedTeams = 20 } = {}) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  if (!Array.isArray(payload) || payload.length !== expectedTeams) throw new Error(`Tabela inesperada: ${Array.isArray(payload) ? payload.length : typeof payload} clubes (esperado ${expectedTeams}).`)
  return payload.map((entry) => {
    const slug = teamSlug(entry.time?.nome_popular)
    for (const field of ['pontos', 'jogos', 'vitorias', 'empates', 'derrotas', 'gols_pro', 'gols_contra']) {
      if (!Number.isInteger(entry[field])) throw new Error(`Campo ${field} inválido para ${slug}.`)
    }
    return {
      club: slug,
      points: entry.pontos,
      played: entry.jogos,
      wins: entry.vitorias,
      draws: entry.empates,
      losses: entry.derrotas,
      goalsFor: entry.gols_pro,
      goalsAgainst: entry.gols_contra,
    }
  })
}

/** Conciliação da tabela da API com a nossa (standings computadas dos placares). */
export function reconcileTable(apiRows, ourRows) {
  const ours = new Map(ourRows.map((row) => [row.club, row]))
  const report = []
  let divergences = 0
  for (const row of apiRows) {
    const mine = ours.get(row.club)
    if (!mine) { divergences += 1; report.push(`${row.club}: ausente na nossa tabela`); continue }
    for (const field of ['points', 'played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst']) {
      if (mine[field] !== row[field]) {
        divergences += 1
        report.push(`${row.club}.${field}: API ${row[field]} vs nós ${mine[field]}`)
      }
    }
  }
  return { divergences, report }
}

/** Detalhe de partida → cartões por clube (cross-check com 365scores). */
export function parseMatchCards(jsonText) {
  const payload = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  const match = payload?.partida_id != null ? payload : payload?.partida
  if (!match?.partida_id) throw new Error('Detalhe de partida sem partida_id.')
  const home = teamSlug(match.time_mandante?.nome_popular)
  const away = teamSlug(match.time_visitante?.nome_popular)
  const cards = match.cartoes ?? {}
  const count = (list) => Array.isArray(list) ? list.length : 0
  return {
    partidaId: match.partida_id,
    home,
    away,
    homeGoals: Number(match.placar_mandante),
    awayGoals: Number(match.placar_visitante),
    yellowHome: count(cards.amarelo?.mandante),
    yellowAway: count(cards.amarelo?.visitante),
    redHome: count(cards.vermelho?.mandante),
    redAway: count(cards.vermelho?.visitante),
  }
}

/** Fusão incremental por partidaId; o que já foi coletado NUNCA é sobrescrito. */
export function mergeMatches(existing, incoming) {
  const byId = new Map(existing.map((match) => [match.partidaId, match]))
  for (const match of incoming) if (!byId.has(match.partidaId)) byId.set(match.partidaId, match)
  return [...byId.values()].sort((left, right) => left.partidaId - right.partidaId)
}

/** Módulo TS gerado (src/scorers2026.ts) com posições por empate. */
export function renderScorersModule({ scorers, fetchedAt, sourceSha }) {
  const lines = scorers.slice(0, 30).map((scorer) => `  { name: '${scorer.name.replace(/'/g, "\\'")}', club: '${scorer.club}', goals: ${scorer.goals} },`)
  return `/**
 * Artilharia 2026 — GERADO por scripts/refresh-apifutebolbr.mjs a partir da
 * API Futebol BR (campeonato 10, edição atual). NÃO EDITAR À MÃO.
 *
 * Fonte informativa: não alimenta o modelo de gols. Σgols de atletas ≈ gols
 * pró da tabela menos os gols contra; pequenas diferenças por clube são
 * esperadas e documentadas na auditoria (§19).
 */

export const SCORERS_SOURCE = {
  name: 'API Futebol BR',
  fetchedAt: '${fetchedAt}',
  sha256: '${sourceSha}',
} as const

export interface Scorer2026 {
  name: string
  club: string
  goals: number
}

export const scorers2026: readonly Scorer2026[] = [
${lines.join('\n')}
]
`
}
