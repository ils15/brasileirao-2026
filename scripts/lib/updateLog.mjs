/**
 * Render puro de `docs/atualizacoes.md`.
 *
 * O arquivo é o log público por execução. O cabeçalho carrega o instante do
 * pacote publicado (`CURRENT_SEASON_PACK_GENERATED_AT`) e cada entrada com
 * resultado novo fecha com o corte, a contagem de disputados/pendentes e os
 * adiados. Tudo deriva do estado recebido — nenhuma data ou contagem é literal.
 *
 * Entradas antigas são preservadas verbatim: o render só troca o cabeçalho e
 * acrescenta a nova entrada. `replaceLast` existe para reparar a última entrada
 * quando ela foi escrita por um render antigo; não reescreve o histórico.
 */

import { formatBrazilLocalIso } from './dataPipeline.mjs'

export const UPDATE_LOG_TITLE = '# Log de atualizações automáticas'

const INTRO = 'Cada entrada é uma execução pós-rodada do updater (`scripts/update-data.mjs`); resultados só entram se conciliarem com o calendário CBF de 380 jogos (par ordenado único, disputados + pendentes = 380) e a suíte completa passar. Execuções sem dados novos conciliáveis são no-op e não aparecem aqui. A data do título é o dia UTC de processamento (`today` no updater), não a data local do kickoff, da captura ou da publicação.'

const GENERATED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** Corte UTC (segundos) e ISO local de Brasília, ambos derivados de `generatedAt`. */
export function packTimestamps(generatedAt) {
  if (typeof generatedAt !== 'string' || !GENERATED_AT_RE.test(generatedAt)) {
    throw new Error(`generatedAt inválido para o log: ${JSON.stringify(generatedAt)}`)
  }
  const cutoffUtc = `${generatedAt.slice(0, 19)}Z`
  return { cutoffUtc, cutoffLocal: formatBrazilLocalIso(cutoffUtc) }
}

/** Parágrafo de abertura: o instante do pacote vem do próprio pacote. */
export function renderUpdateLogHeader({ generatedAt }) {
  const { cutoffLocal } = packTimestamps(generatedAt)
  return `${INTRO} O pacote atual foi gerado em \`${generatedAt}\` (\`${cutoffLocal}\`); captura individual das fontes e horário de publicação não são registrados.`
}

/**
 * Contagens da entrada, derivadas do pacote: cada resultado novo sai dos
 * pendentes na mesma execução, então `antes = depois ∓ addedCount`. O total
 * precisa fechar com o calendário — divergência aborta em vez de publicar
 * um fechamento inventado.
 */
export function updateLogTotals({ results, remaining, addedCount, scheduleLength }) {
  if (!Array.isArray(results) || !Array.isArray(remaining)) {
    throw new TypeError('updateLogTotals exige results e remaining como arrays')
  }
  if (!Number.isInteger(addedCount) || addedCount < 0) {
    throw new Error(`addedCount inválido para o log: ${addedCount}`)
  }
  const resultsAfter = results.length
  const pendingAfter = remaining.length
  const resultsBefore = resultsAfter - addedCount
  const pendingBefore = pendingAfter + addedCount
  if (resultsBefore < 0) throw new Error(`addedCount ${addedCount} excede os resultados do pacote (${resultsAfter})`)
  if (resultsBefore + pendingBefore !== scheduleLength) {
    throw new Error(`Contagem do log não fecha com o calendário: ${resultsBefore} + ${pendingBefore} ≠ ${scheduleLength}`)
  }
  return {
    resultsBefore,
    resultsAfter,
    pendingBefore,
    pendingAfter,
    postponed: remaining.filter(({ round }) => / adiado$/.test(round)).length,
    scheduleLength,
  }
}

/** Uma entrada do log: resultados novos + bloco de fechamento do pacote. */
export function renderUpdateLogEntry({ date, added, generatedAt, totals }) {
  if (!Array.isArray(added) || added.length === 0) {
    throw new Error('Entrada do log exige ao menos um resultado novo')
  }
  const { cutoffUtc, cutoffLocal } = packTimestamps(generatedAt)
  const matchLines = added.map((match) =>
    `- ${match.home} ${match.homeGoals}–${match.awayGoals} ${match.away} (${match.source}, ${match.sourceRef})`)
  return [
    `## ${date} — ${added.length} novo(s) resultado(s)`,
    '',
    ...matchLines,
    '',
    `Corte do pacote: \`${cutoffUtc}\` (\`${cutoffLocal}\`); gerado em \`${generatedAt}\`.`,
    `Resultados de 2026: ${totals.resultsBefore} → ${totals.resultsAfter}; pendentes: ${totals.pendingBefore} → ${totals.pendingAfter} (${totals.resultsAfter} disputados + ${totals.pendingAfter} pendentes = ${totals.scheduleLength} do calendário CBF; ${totals.postponed} adiado(s)).`,
  ].join('\n')
}

/** Entradas existentes, verbatim, a partir dos títulos `## `. */
function splitEntries(markdown) {
  const text = markdown.replace(/\r\n/g, '\n').trimEnd()
  const separator = '\n## '
  const start = text.indexOf(separator)
  if (start === -1) return []
  return text.slice(start + 1).split(separator).map((entry, index) => (index === 0 ? entry : `## ${entry}`).trimEnd())
}

/**
 * Documento completo: cabeçalho sempre derivado do pacote atual, entradas
 * anteriores preservadas e a nova entrada anexada (ou, com `replaceLast`,
 * substituindo a última — reparo pontual de render antigo).
 */
export function renderUpdateLog({ previous = null, entry, replaceLast = false }) {
  const entries = previous ? splitEntries(previous) : []
  if (replaceLast) {
    if (entries.length === 0) throw new Error('replaceLast exige ao menos uma entrada anterior')
    entries[entries.length - 1] = renderUpdateLogEntry(entry)
  } else {
    entries.push(renderUpdateLogEntry(entry))
  }
  return `${UPDATE_LOG_TITLE}\n\n${renderUpdateLogHeader(entry)}\n\n${entries.join('\n\n')}\n`
}
