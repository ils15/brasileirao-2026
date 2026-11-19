import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/brasileirao-2026/' : '/',
  plugins: [react()],
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
