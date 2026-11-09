export const SIMULATION_COUNT = 500_000
export const SIMULATION_SEED = 20_261_104
export const BACKTEST_SIMULATIONS = 5_000
export const SHRINKAGE_MATCHES = 20
export const BACKTEST_CUTOFF = 300
export const MC_CI_Z = 1.96
export const POINT_CURVE_LOW_SAMPLE_WIDTH = 0.10
export const SHRINKAGE_CANDIDATES = [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30] as const

/**
 * Blend xG × gols (§18 da auditoria): o λ de produção mistura o modelo em
 * gols (base longa 2012–2026) com o modelo estimado em xG da temporada 2026
 * (fonte 365scores). O peso fixo é o vencedor do walk-forward por rodada de
 * 2026 (Brier de resultado V/E/D), medido por `runXgBlendAblation` — se o
 * empate técnico persistir, 0 mantém o modelo só em gols.
 */
export const XG_BLEND_CANDIDATES = [0, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1] as const
export const XG_BLEND_WEIGHT = 0.15 as const
/** Mínimo de jogos com cobertura de xG para o blend ser aplicado em produção. */
export const XG_MIN_COVERED_MATCHES = 40

/**
 * Fronteiras de zona usadas em toda a aplicação (classificação exibida,
 * contagem por clube na simulação e rótulos). G-6 é o cenário deste painel,
 * não uma conclusão automática por o Palmeiras chegar à final da Copa do
 * Brasil; a alocação depende das regras e da sobreposição de classificados.
 * Pelo Art. 7 do REC CBF 2026, os seis seguintes fora da Libertadores vão à
 * Sul-Americana. As categorias exclusivas derivam destas fronteiras; o campeão
 * é separado apenas para nomear "Libertadores · 2º–6º*".
 */
export const ZONES = {
  libertadores: { label: 'Libertadores', detail: '1º–6º* (1º–4º direto; 5º preliminar)', from: 1, to: 6 },
  sudamericana: { label: 'Sul-Americana', detail: '7º–12º', from: 7, to: 12 },
  middle: { label: 'Meio de tabela', detail: '13º–16º', from: 13, to: 16 },
  relegation: { label: 'Rebaixamento', detail: '17º–20º', from: 17, to: 20 },
} as const

export function isPositionInZone(position: number, zone: { readonly from: number; readonly to: number }): boolean {
  return position >= zone.from && position <= zone.to
}

export const RESULT_GROUPS = [
  { id: 'champion', label: 'Campeão' },
  { id: 'libertadores', label: 'Libertadores · 2º–6º*' },
  { id: 'sudamericana', label: 'Sul-Americana · 7º–12º' },
  { id: 'middle', label: 'Meio de tabela · 13º–16º' },
  { id: 'relegation', label: 'Rebaixamento · 17º–20º' },
] as const

export type ResultGroupId = (typeof RESULT_GROUPS)[number]['id']
