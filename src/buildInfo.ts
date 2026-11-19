/**
 * Identidade do bundle publicado: versão do pacote, commit e data do commit.
 * Os valores vêm de `define` em `vite.config.ts`; a data é a do commit, nunca
 * `new Date()`, para que builds do mesmo commit gerem bytes idênticos.
 */

export interface BuildInfo {
  version: string
  /** SHA completo do commit (ou `dev` fora do repositório). */
  sha: string
  /** Primeiros 7 caracteres do SHA, exibidos no rodapé. */
  sha7: string
  /** Data do commit em ISO UTC; `null` quando não há define nem git. */
  time: string | null
}

type BuildEnv = {
  version?: unknown
  sha?: unknown
  time?: unknown
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Deriva `sha7` e aplica o fallback `dev`; exposto para testar a guarda. */
export function resolveBuildInfo(env: BuildEnv): BuildInfo {
  const sha = nonEmpty(env.sha) ?? 'dev'
  return {
    version: nonEmpty(env.version) ?? 'dev',
    sha,
    sha7: sha.slice(0, 7),
    time: nonEmpty(env.time),
  }
}

const hasDefine = typeof __BUILD_SHA__ !== 'undefined'

export const buildInfo: BuildInfo = hasDefine
  ? resolveBuildInfo({ version: __APP_VERSION__, sha: __BUILD_SHA__, time: __BUILD_TIME__ })
  : resolveBuildInfo({})
