import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Saída de um comando git; `null` quando o git ou o repositório não existem. */
function gitOutput(args: string[]): string | null {
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return output.length > 0 ? output : null
  } catch {
    return null
  }
}

const packageVersion = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

/**
 * Data do commit, em ISO UTC — nunca o relógio da máquina: dois builds do
 * mesmo commit precisam produzir bytes idênticos. `SOURCE_DATE_EPOCH` tem
 * precedência para builds reproduzíveis fora do git.
 */
function resolveBuildTime(): string | null {
  const epoch = process.env.SOURCE_DATE_EPOCH
  const raw = epoch
    ? Number(epoch) * 1000
    : gitOutput(['show', '-s', '--format=%cI', 'HEAD'])
  if (raw === null) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/brasileirao-2026/' : '/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
    __BUILD_SHA__: JSON.stringify(gitOutput(['rev-parse', 'HEAD']) ?? 'dev'),
    __BUILD_TIME__: JSON.stringify(resolveBuildTime()),
  },
  build: {
    // Vite 8/Rolldown: o objeto `manualChunks` foi removido; grupos de
    // `codeSplitting` mantêm React/ReactDOM em chunk estável entre deploys,
    // para que a atualização pós-rodada invalide só os chunks do app.
    rolldownOptions: {
      // O módulo de histórico é dados puros. Marcá-lo sem efeitos colaterais
      // evita que o re-export em `projectionData` puxe 424 KB no boot; as abas
      // lazy e o worker continuam importando os símbolos que usam.
      treeshake: {
        moduleSideEffects: [
          { test: /[\\/]src[\\/]historicalSeasons\.ts$/, sideEffects: false },
        ],
      },
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            // Histórico (≈424 KB de fonte) é compartilhado só por abas lazy e
            // pelo worker. Sem grupo próprio, o Rolldown o promove ao chunk
            // inicial por ser dependência comum; aqui ele vira chunk sob demanda.
            { name: 'historical-data', test: /[\\/]src[\\/]historicalSeasons\.ts$/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // O primeiro uso de qualquer painel que toque a projeção paga o cold start
    // dos backtests walk-forward (14 temporadas); runners de CI são mais lentos.
    testTimeout: 30_000,
  },
})
