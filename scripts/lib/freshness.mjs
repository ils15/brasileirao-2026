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
 */

const MS_PER_HOUR = 3_600_000

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
