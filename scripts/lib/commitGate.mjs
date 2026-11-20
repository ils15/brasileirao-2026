/**
 * Seletor do gate de pre-commit por caminho.
 *
 * `.githooks/pre-commit` rodava a suíte completa e o build de Pages em **todo**
 * commit. O updater escreve os módulos e só então commita
 * (`scripts/update-data.mjs`), então uma falha de UI sem relação com os dados
 * transformava a atualização automática em árvore suja sem diagnóstico (ver
 * `.pantheon/deepwork/incident-stats-refresh/DISCOVERY.md`, D7).
 *
 * A regra é conservadora: só paga o gate completo quem mexeu em algo fora da
 * allowlist de dados publicados. Qualquer ambiguidade — lista vazia, entrada
 * inválida, exceção — cai em `full`; o gate nunca é pulado.
 *
 * Funções puras: sem I/O, sem processo, sem git.
 */

/**
 * Caminhos que o updater publica. Terminador `/` marca prefixo de diretório.
 *
 * Idêntico a `data_paths` de `.github/workflows/update-data.yml`; o teste
 * compara as duas listas para que a allowlist não divirja do workflow.
 */
export const DATA_PATHS = [
  'src/currentSeasonResults.ts',
  'src/projectionData.ts',
  'src/sourceMetadata.ts',
  'src/advancedStats2026.ts',
  'src/scorers2026.ts',
  'data/source-snapshots/',
  'docs/atualizacoes.md',
]

/**
 * Checagem de whitespace do conteúdo staged. Vive no runner (não em
 * `gateFor`) porque roda em todos os modos, antes dos comandos do gate.
 * Array de argumentos: nada é interpretado por um shell.
 */
export const WHITESPACE_CHECK = ['git', 'diff', '--cached', '--check']

const DATA_ONLY_LABEL = 'dados gerados (contrato de dados)'
const FULL_LABEL = 'suíte completa + build de Pages'

const DATA_ONLY_COMMANDS = ['npm run test:data']
const FULL_COMMANDS = ['npm test', 'GITHUB_PAGES=true npm run build']

/** `./src/x.ts` e `src/x.ts` são o mesmo caminho para o git. */
function normalizePath(value) {
  if (typeof value !== 'string') return null
  let path = value.trim()
  if (path === '') return null
  while (path.startsWith('./')) path = path.slice(2)
  return path === '' ? null : path
}

function isDataPath(path) {
  return DATA_PATHS.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  )
}

function fullClassification(reason, matched = [], unmatched = []) {
  return { mode: 'full', reason, matched, unmatched }
}

/**
 * Classifica os caminhos staged.
 *
 * @param {string[]} paths caminhos relativos à raiz do repositório
 * @returns {{mode: 'data-only' | 'full', reason: string, matched: string[], unmatched: string[]}}
 */
export function classifyCommit(paths) {
  try {
    if (!Array.isArray(paths)) {
      return fullClassification('entrada não é uma lista de caminhos: fail-safe full')
    }
    if (paths.length === 0) {
      return fullClassification('nenhum caminho staged: fail-safe full')
    }

    const matched = []
    const unmatched = []
    for (const raw of paths) {
      const path = normalizePath(raw)
      if (path === null) {
        return fullClassification(
          `caminho staged inválido (${JSON.stringify(raw)}): fail-safe full`,
          matched,
          [...unmatched, String(raw)],
        )
      }
      if (isDataPath(path)) matched.push(path)
      else unmatched.push(path)
    }

    if (unmatched.length > 0) {
      return fullClassification(
        `${unmatched.length} caminho(s) fora da allowlist de dados`,
        matched,
        unmatched,
      )
    }
    return {
      mode: 'data-only',
      reason: `${matched.length} caminho(s) apenas na allowlist de dados`,
      matched,
      unmatched,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fullClassification(`falha ao classificar (${message}): fail-safe full`)
  }
}

/**
 * Comandos do gate para o modo dado. Qualquer valor diferente de `data-only`
 * — inclusive um modo inválido — cai no gate completo.
 *
 * @param {'data-only' | 'full' | string} mode
 * @returns {{commands: string[], label: string}}
 */
export function gateFor(mode) {
  if (mode === 'data-only') {
    return { commands: [...DATA_ONLY_COMMANDS], label: DATA_ONLY_LABEL }
  }
  return { commands: [...FULL_COMMANDS], label: FULL_LABEL }
}
