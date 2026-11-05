import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/brasileirao-2026/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // O primeiro uso de qualquer painel que toque a projeção paga o cold start
    // dos backtests walk-forward (14 temporadas); runners de CI são mais lentos.
    testTimeout: 30_000,
  },
})
