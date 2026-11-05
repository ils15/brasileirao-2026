export const SIMULATION_COUNT = 20_000
export const SIMULATION_SEED = 20_261_104
export const BACKTEST_SIMULATIONS = 5_000
export const SHRINKAGE_MATCHES = 20
export const BACKTEST_CUTOFF = 300
export const MC_CI_Z = 1.96
export const POINT_CURVE_LOW_SAMPLE_WIDTH = 0.10
export const SHRINKAGE_CANDIDATES = [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30] as const

export const RESULT_GROUPS = [
  { id: 'champion', label: 'Campeão' },
  { id: 'libertadores', label: 'Libertadores · 2º–5º' },
  { id: 'sudamericana', label: 'Sul-Americana' },
  { id: 'middle', label: 'Meio de tabela' },
  { id: 'relegation', label: 'Rebaixamento' },
] as const

export type ResultGroupId = (typeof RESULT_GROUPS)[number]['id']
