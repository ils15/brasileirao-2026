/**
 * Parser puro dos argumentos de `scripts/update-data.mjs`.
 *
 * A função não toca o processo, a rede nem o disco: recebe `argv` (sem os dois
 * primeiros itens do `process.argv`) e devolve a configuração da execução. O
 * default de cada flag reproduz o comportamento histórico do updater.
 *
 * Flags:
 * - `--dry-run`     coleta e mostra o diff, sem escrever nem commitar.
 * - `--offline`     proíbe rede: usa só snapshots locais, pula fontes
 *                   secundárias e a conciliação externa. Diferente de
 *                   `--dry-run`, escreve o pacote.
 * - `--today=AAAA-MM-DD`  substitui o dia UTC corrente (reprodução determinística).
 * - `--cutoff=AAAA-MM-DDTHH:MM:SSZ`  substitui o corte empacotado lido de
 *                   `src/sourceMetadata.ts` (reprodução independente do estado vivo).
 *                   Default: o corte do pacote, sem mudança de comportamento.
 * - `--test=<cmd>`  comando do gate executado antes do commit.
 *                   Default: `npm run test:data` (contrato de dados). O gate
 *                   completo (`npm test`) roda no workflow, antes da publicação.
 * - `--no-commit`   escreve módulos/snapshots/log e roda o gate, sem `git add/commit`.
 */

export const DEFAULT_TEST_COMMAND = 'npm run test:data'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

/** `AAAA-MM-DD` válido no calendário (rejeita 2026-02-30, 2026-13-01, …). */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

/** Instante UTC no formato exato que `readCurrentCutoff` devolve. */
export function isIsoInstant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return `${parsed.toISOString().slice(0, 19)}Z` === value
}

/**
 * O corte é o instante do último pacote; `today` é o dia UTC da coleta.
 * `--cutoff` posterior ao dia de `--today` é incoerência de configuração:
 * falha alto em vez de "descobrir" que não há nada a coletar.
 */
export function assertCutoffNotAfterToday({ cutoffUtc, today }) {
  if (!isIsoInstant(cutoffUtc)) throw new Error(`Corte inválido: "${cutoffUtc}"`)
  if (!isIsoDate(today)) throw new Error(`Dia inválido: "${today}"`)
  if (cutoffUtc.slice(0, 10) > today) {
    throw new Error(`--cutoff posterior a --today: ${cutoffUtc} > ${today}`)
  }
}

/**
 * @param {string[]} argv argumentos após o nome do script
 * @returns {{dryRun: boolean, offline: boolean, today: string | null, cutoff: string | null, testCommand: string, noCommit: boolean}}
 */
export function parseUpdateArgs(argv = []) {
  const options = {
    dryRun: false,
    offline: false,
    today: null,
    cutoff: null,
    testCommand: DEFAULT_TEST_COMMAND,
    noCommit: false,
  }

  for (const arg of argv) {
    if (typeof arg !== 'string' || arg === '') {
      throw new Error(`Argumento inválido para o updater: ${JSON.stringify(arg)}`)
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--offline') {
      options.offline = true
      continue
    }

    if (arg === '--no-commit') {
      options.noCommit = true
      continue
    }

    if (arg.startsWith('--today=')) {
      const value = arg.slice('--today='.length)
      if (!isIsoDate(value)) {
        throw new Error(`--today inválido: "${value}" (esperado AAAA-MM-DD do calendário)`)
      }
      options.today = value
      continue
    }

    if (arg.startsWith('--cutoff=')) {
      const value = arg.slice('--cutoff='.length)
      if (!isIsoInstant(value)) {
        throw new Error(`--cutoff inválido: "${value}" (esperado AAAA-MM-DDTHH:MM:SSZ)`)
      }
      options.cutoff = value
      continue
    }

    if (arg.startsWith('--test=')) {
      const value = arg.slice('--test='.length).trim()
      if (value === '') {
        throw new Error('--test requer um comando não vazio')
      }
      options.testCommand = value
      continue
    }

    throw new Error(`Argumento desconhecido: ${arg}`)
  }

  if (options.dryRun && options.noCommit) {
    throw new Error('--dry-run e --no-commit são incompatíveis: --dry-run não escreve nem commita')
  }

  if (options.cutoff !== null && options.today !== null) {
    assertCutoffNotAfterToday({ cutoffUtc: options.cutoff, today: options.today })
  }

  return options
}
