/**
 * Aritmética de frescor do pacote de dados — pura, sem I/O.
 *
 * O corte analítico (`ANALYTICAL_CUTOFF_UTC`) é o instante que delimita o que o
 * pacote versionado já incorpora. A "idade" do pacote é a distância entre esse
 * corte e o agora, em horas decimais.
 *
 * Convenções:
 * - `stalenessHours` devolve `null` quando o corte ou o agora não formam um
 *   instante válido; é a primitiva tolerante, boa para exibir.
 * - `isStale` é a primitiva de decisão: data inválida **lança**, porque tratar
 *   um corte ilegível como "fresco" é exatamente o silêncio que o alarme existe
 *   para quebrar. O limite é inclusivo: idade >= `maxAgeHours` já é defasagem.
 * - Idade negativa (agora antes do corte) não é defasagem; devolve o valor
 *   negativo, que o chamador pode reportar como relógio/fuso suspeito.
 * - `expectedResultPending` responde à pergunta que a idade crua não responde:
 *   o corte parou porque **não houve jogo**, ou porque um resultado que já
 *   existia não foi publicado? Ela só afirma pendência com um kickoff no
 *   intervalo — sem evidência, devolve `false`.
 */

const MS_PER_HOUR = 3_600_000

/**
 * Intervalo entre o apito final e a fonte publicar o resultado. O alarme não
 * pode acusar atraso antes disso: o placar ainda não existia para ser coletado.
 */
export const DEFAULT_GRACE_HOURS = 6

/**
 * Limite de defasagem das fontes secundárias (xG/cartões). Sete dias cobrem
 * pelo menos uma rodada inteira: o updater roda a cada 2h quando há rede, então
 * uma captura mais antiga que isso já perdeu jogos que o pacote publica.
 */
export const DEFAULT_SECONDARY_MAX_AGE_HOURS = 168

/** Converte string ISO, `Date` ou epoch-ms em epoch-ms; `null` se inválido. */
function toEpochMs(value) {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

/**
 * Idade do pacote em horas decimais.
 *
 * @param {{ cutoffUtc: string | number | Date, now?: string | number | Date }} input
 * @returns {number | null} horas, possivelmente negativas; `null` se alguma data
 *   for inválida (ausente, malformada, `Invalid Date`).
 */
export function stalenessHours({ cutoffUtc, now = new Date() } = {}) {
  const cutoffMs = toEpochMs(cutoffUtc)
  const nowMs = toEpochMs(now)
  if (cutoffMs == null || nowMs == null) return null
  return (nowMs - cutoffMs) / MS_PER_HOUR
}

/**
 * O pacote está defasado?
 *
 * @param {{ cutoffUtc: string | number | Date, now?: string | number | Date, maxAgeHours?: number }} input
 * @returns {boolean} `true` quando idade >= `maxAgeHours` (limite inclusivo).
 * @throws {Error} se o corte ou o agora forem inválidos, ou se `maxAgeHours`
 *   não for um número finito e não negativo. Falhar alto é proposital.
 */
export function isStale({ cutoffUtc, now = new Date(), maxAgeHours = 24 } = {}) {
  const hours = stalenessHours({ cutoffUtc, now })
  if (hours == null) {
    throw new Error(
      `corte analítico inválido: cutoffUtc=${JSON.stringify(cutoffUtc)} now=${JSON.stringify(now)}`,
    )
  }
  if (typeof maxAgeHours !== 'number' || !Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
    throw new Error(`maxAgeHours inválido: ${JSON.stringify(maxAgeHours)}`)
  }
  return hours >= maxAgeHours
}

/**
 * A captura secundária está defasada para um pacote que já tem jogo encerrado?
 *
 * A idade sozinha não decide: sem jogo no pacote (entressafra/antes da estreia)
 * não existe partida para o xG/cartões cobrirem, então a resposta é `false`
 * mesmo com captura antiga. Com jogo encerrado, vale o mesmo limite inclusivo
 * de `isStale`; captura ilegível **lança**, porque tratá-la como fresca é o
 * silêncio que o alarme existe para quebrar.
 *
 * @param {{
 *   fetchedAt: string | number | Date,
 *   now?: string | number | Date,
 *   maxAgeHours?: number,
 *   finishedMatches?: number,
 * }} input
 * @returns {boolean}
 */
export function isSecondaryStale({
  fetchedAt,
  now = new Date(),
  maxAgeHours = DEFAULT_SECONDARY_MAX_AGE_HOURS,
  finishedMatches = 0,
} = {}) {
  if (!Number.isInteger(finishedMatches) || finishedMatches < 0) {
    throw new Error(`finishedMatches inválido: ${JSON.stringify(finishedMatches)}`)
  }
  if (finishedMatches === 0) return false
  return isStale({ cutoffUtc: fetchedAt, now, maxAgeHours })
}

/**
 * Kickoffs de partidas que o scoreboard já dá por **encerradas**.
 *
 * Só evento `post` conta: um `pre` que virou passado pode ser jogo adiado,
 * cancelado ou simplesmente o último snapshot antes da rodada — evidência fraca
 * demais para transformar o alarme em ruído. Aceita o payload bruto da ESPN
 * (`events[].status.type.state` + `events[].date`), sem I/O.
 *
 * @param {unknown} payload
 * @returns {string[]} kickoffs ISO/UTC, sem repetição e em ordem crescente.
 */
export function completedKickoffsFromScoreboard(payload) {
  const events = payload?.events
  if (!Array.isArray(events)) return []
  const kickoffs = new Set()
  for (const event of events) {
    if (event?.status?.type?.state !== 'post') continue
    const kickoff = event.competitions?.[0]?.date ?? event.date
    if (typeof kickoff !== 'string' || kickoff.trim() === '') continue
    if (!Number.isFinite(Date.parse(kickoff))) continue
    kickoffs.add(kickoff)
  }
  return [...kickoffs].sort((a, b) => Date.parse(a) - Date.parse(b))
}

/**
 * Existe resultado que já deveria ter sido publicado?
 *
 * `true` somente quando algum kickoff cai em `(cutoffUtc, now - graceHours]`:
 * o jogo começou **depois** do corte (logo, não está incorporado) e já passou
 * da carência de publicação. Kickoff futuro ou dentro da carência não é atraso.
 *
 * @param {{
 *   cutoffUtc: string | number | Date,
 *   now?: string | number | Date,
 *   kickoffs?: Array<string | number | Date> | null,
 *   graceHours?: number,
 * }} input
 * @returns {boolean} `false` sem kickoffs (não afirma pendência sem evidência).
 * @throws {Error} corte/agora inválidos ou `graceHours` fora de finito >= 0 —
 *   mesma regra de `isStale`: entrada ilegível nunca vira "sem pendência".
 */
export function expectedResultPending({
  cutoffUtc,
  now = new Date(),
  kickoffs = [],
  graceHours = DEFAULT_GRACE_HOURS,
} = {}) {
  const cutoffMs = toEpochMs(cutoffUtc)
  const nowMs = toEpochMs(now)
  if (cutoffMs == null || nowMs == null) {
    throw new Error(
      `corte analítico inválido: cutoffUtc=${JSON.stringify(cutoffUtc)} now=${JSON.stringify(now)}`,
    )
  }
  if (typeof graceHours !== 'number' || !Number.isFinite(graceHours) || graceHours < 0) {
    throw new Error(`graceHours inválido: ${JSON.stringify(graceHours)}`)
  }
  if (kickoffs == null) return false
  if (!Array.isArray(kickoffs)) {
    throw new TypeError(`kickoffs deve ser uma lista de kickoffs; recebido ${typeof kickoffs}`)
  }
  if (kickoffs.length === 0) return false

  const publishByMs = nowMs - graceHours * MS_PER_HOUR
  return kickoffs.some((kickoff) => {
    const kickoffMs = toEpochMs(kickoff)
    return kickoffMs != null && kickoffMs > cutoffMs && kickoffMs <= publishByMs
  })
}
