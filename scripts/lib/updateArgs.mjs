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
 * - `--test=<cmd>`  comando do gate executado antes do commit.
 * - `--no-commit`   escreve módulos/snapshots/log e roda o gate, sem `git add/commit`.
 */

export const DEFAULT_TEST_COMMAND = 'npm test'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `AAAA-MM-DD` válido no calendário (rejeita 2026-02-30, 2026-13-01, …). */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

/**
 * @param {string[]} argv argumentos após o nome do script
 * @returns {{dryRun: boolean, offline: boolean, today: string | null, testCommand: string, noCommit: boolean}}
 */
export function parseUpdateArgs(argv = []) {
  const options = {
    dryRun: false,
    offline: false,
    today: null,
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

  return options
}
