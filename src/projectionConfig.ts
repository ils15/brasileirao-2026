export const SIMULATION_COUNT = 500_000
export const SIMULATION_SEED = 20_261_104
export const BACKTEST_SIMULATIONS = 5_000
export const SHRINKAGE_MATCHES = 20
export const BACKTEST_CUTOFF = 300
export const MC_CI_Z = 1.96
export const POINT_CURVE_LOW_SAMPLE_WIDTH = 0.10
export const SHRINKAGE_CANDIDATES = [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30] as const

/**
 * Fronteiras de zona usadas em TODA a aplicação (classificação exibida,
 * contagem por clube na simulação e rótulos). Antes da auditoria existiam
 * três definições convivendo: probabilidades por clube (1º–5º), categorias
 * exclusivas (2º–5º) e legenda da classificação (1º–6º). As categorias
 * exclusivas de `RESULT_GROUPS` derivam destas fronteiras: o campeão é
 * separado apenas para nomear a categoria "Libertadores · 2º–5º".
 */
export const ZONES = {
  libertadores: { label: 'Libertadores', detail: '1º–5º (1º–4º direto; 5º preliminar)', from: 1, to: 5 },
  sudamericana: { label: 'Sul-Americana', detail: '6º–11º', from: 6, to: 11 },
  middle: { label: 'Meio de tabela', detail: '12º–16º', from: 12, to: 16 },
  relegation: { label: 'Rebaixamento', detail: '17º–20º', from: 17, to: 20 },
} as const

export const RESULT_GROUPS = [
  { id: 'champion', label: 'Campeão' },
  { id: 'libertadores', label: 'Libertadores · 2º–5º' },
  { id: 'sudamericana', label: 'Sul-Americana · 6º–11º' },
  { id: 'middle', label: 'Meio de tabela · 12º–16º' },
  { id: 'relegation', label: 'Rebaixamento · 17º–20º' },
] as const

export type ResultGroupId = (typeof RESULT_GROUPS)[number]['id']
