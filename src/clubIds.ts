/**
 * Normalização de identificadores de clube entre fontes.
 * O histórico 2021–2025 (Football-Data) grava São Paulo como `saopaulo`,
 * enquanto a base 2026 (ESPN/CBF) usa `sao-paulo`. Todo empacotamento de
 * partidas históricas passa por aqui para que os módulos compartilhem um
 * único espaço de IDs (auditoria de cálculos, item "alias aplicado
 * inconsistentemente").
 */
export const TEAM_ID_ALIASES: Readonly<Record<string, string>> = {
  saopaulo: 'sao-paulo',
}

export function normalizeTeamId(id: string): string {
  return TEAM_ID_ALIASES[id] ?? id
}
