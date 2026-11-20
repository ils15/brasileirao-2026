export const SIMULATION_COUNT = 500_000
export const SIMULATION_SEED = 20_261_104
export const BACKTEST_SIMULATIONS = 5_000
/**
 * Orçamento reduzido usado **apenas** pelo servidor de desenvolvimento
 * (`import.meta.env.DEV` na borda do worker). Os valores canônicos acima são os
 * de produção e continuam sendo os defaults de `runProjectionRaw` — nenhuma
 * biblioteca lê `import.meta.env`, então os testes seguem determinísticos.
 */
export const DEV_SIMULATION_COUNT = 20_000
export const DEV_BACKTEST_SIMULATIONS = 2_000
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
 * Vagas de Libertadores devolvidas à tabela do Brasileirão.
 *
 * Base regulatória: Art. 7 do REC CBF 2026 e Manual de Clubes da Conmebol. O
 * Brasil tem cota fixa de 7 vagas continentais (5 diretas + 2 preliminares).
 * Quatro vagas podem voltar à tabela quando o detentor já está classificado
 * pelo Brasileirão **ou** foi rebaixado — o motivo da devolução é indiferente:
 * cada uma empurra a linha de corte uma posição e preserva o tipo da vaga.
 *
 * `true` significa "esta vaga foi devolvida à tabela do Brasileirão", não
 * "o detentor está classificado".
 *
 * Efeito dominó obrigatório: a Sul-Americana ocupa sempre
 * `[linha + 1, linha + 6]` e o rebaixamento fica fixo em 17º–20º; a faixa
 * neutra é o que sobra entre as duas. G-5 não devolve nenhuma vaga; G-9 é o
 * teto regulamentar (4 devoluções).
 */
export type LibertadoresScenario = {
  copaDoBrasilCampeaoDevolvido: boolean
  copaDoBrasilViceDevolvido: boolean
  libertadoresCampeaoDevolvido: boolean
  sudamericanaCampeaoDevolvido: boolean
}

/** Cota-base do Brasil: 4 vagas diretas + 1 preliminar = linha G-5. */
export const LIBERTADORES_BASE_SLOTS = { direct: 4, preliminary: 1 } as const
/** Seis clubes seguintes fora da Libertadores vão à Sul-Americana (Art. 7 do REC). */
export const SUDAMERICANA_SLOTS = 6
/** Teto: as quatro devoluções somam +4 e levam a linha de G-5 a G-9. */
export const LIBERTADORES_MAX_LINE = 9
/** Linhas de corte possíveis, da base G-5 ao teto G-9. */
export const LIBERTADORES_LINES = [5, 6, 7, 8, 9] as const

/**
 * Bitmask determinístico das quatro devoluções, na ordem canônica do REC:
 * bit 0 = campeão da Copa do Brasil, bit 1 = vice da Copa do Brasil,
 * bit 2 = campeão da Libertadores, bit 3 = campeão da Sul-Americana.
 * Vai de 0 (nenhuma devolução, G-5) a 15 (todas, G-9).
 */
export type LibertadoresScenarioKey = number

/** Cenário sem nenhuma devolução: linha G-5, apenas a cota-base. */
export const DEFAULT_LIBERTADORES_SCENARIO: LibertadoresScenario = {
  copaDoBrasilCampeaoDevolvido: false,
  copaDoBrasilViceDevolvido: false,
  libertadoresCampeaoDevolvido: false,
  sudamericanaCampeaoDevolvido: false,
}

/**
 * Cenário legado do painel: o campeão da Copa do Brasil devolve a vaga
 * preliminar (o vice sobe para a fase de grupos), reproduzindo a linha G-6
 * publicada antes dos cenários de copa. É o default de `runProjection` quando
 * nenhum cenário é informado, para não alterar resultados e backtests.
 */
export const LEGACY_LIBERTADORES_SCENARIO: LibertadoresScenario = {
  copaDoBrasilCampeaoDevolvido: true,
  copaDoBrasilViceDevolvido: false,
  libertadoresCampeaoDevolvido: false,
  sudamericanaCampeaoDevolvido: false,
}

const SCENARIO_BITS: ReadonlyArray<readonly [keyof LibertadoresScenario, number]> = [
  ['copaDoBrasilCampeaoDevolvido', 1],
  ['copaDoBrasilViceDevolvido', 2],
  ['libertadoresCampeaoDevolvido', 4],
  ['sudamericanaCampeaoDevolvido', 8],
]

/** Converte um cenário na chave estável de 0 a 15 usada por `lineCounts`. */
export function scenarioKeyOf(scenario: LibertadoresScenario): LibertadoresScenarioKey {
  return SCENARIO_BITS.reduce((key, [flag, bit]) => (scenario[flag] ? key | bit : key), 0)
}

/** Reconstrói o cenário a partir da chave de 0 a 15 (inversa de `scenarioKeyOf`). */
export function scenarioFromKey(key: LibertadoresScenarioKey): LibertadoresScenario {
  if (!Number.isInteger(key) || key < 0 || key > 15) throw new Error(`Chave de cenário inválida: ${key}`)
  const has = (bit: number): boolean => (key & bit) !== 0
  return {
    copaDoBrasilCampeaoDevolvido: has(1),
    copaDoBrasilViceDevolvido: has(2),
    libertadoresCampeaoDevolvido: has(4),
    sudamericanaCampeaoDevolvido: has(8),
  }
}

export interface LibertadoresZones {
  /** Última posição que entra direto na fase de grupos. */
  directTo: number
  /** Última posição que entra na Libertadores (direta ou preliminar). */
  libertadoresTo: number
  sudamericanaFrom: number
  sudamericanaTo: number
}

/**
 * Resolve a linha de corte e a divisão direto/preliminar de um cenário.
 *
 * Devoluções de tipo preliminar (Copa do Brasil campeão e vice) somam à vaga
 * preliminar; devoluções de tipo direto (Libertadores e Sul-Americana) somam à
 * vaga de fase de grupos. A ordem entre as quatro fontes não altera o total,
 * mas o mix define `directTo`: só o G-6 com campeão da Libertadores tem 1º–5º
 * direto, enquanto o G-6 com campeão da Copa do Brasil tem 1º–4º direto.
 */
export function resolveLibertadoresZones(scenario: LibertadoresScenario): LibertadoresZones {
  const direct = LIBERTADORES_BASE_SLOTS.direct
    + Number(scenario.libertadoresCampeaoDevolvido)
    + Number(scenario.sudamericanaCampeaoDevolvido)
  const preliminary = LIBERTADORES_BASE_SLOTS.preliminary
    + Number(scenario.copaDoBrasilCampeaoDevolvido)
    + Number(scenario.copaDoBrasilViceDevolvido)
  // Defesa: com as constantes atuais o máximo é 9; o clamp só age se a cota-base crescer.
  const libertadoresTo = Math.min(direct + preliminary, LIBERTADORES_MAX_LINE)
  return {
    directTo: Math.min(direct, libertadoresTo),
    libertadoresTo,
    sudamericanaFrom: libertadoresTo + 1,
    sudamericanaTo: libertadoresTo + SUDAMERICANA_SLOTS,
  }
}

/**
 * Fronteiras de zona usadas em toda a aplicação (classificação exibida,
 * contagem por clube na simulação e rótulos). G-6 é o cenário deste painel,
 * não uma conclusão automática por o Palmeiras chegar à final da Copa do
 * Brasil; a alocação depende das regras e da sobreposição de classificados.
 * Pelo Art. 7 do REC CBF 2026, os seis seguintes fora da Libertadores vão à
 * Sul-Americana. As categorias exclusivas derivam destas fronteiras; o campeão
 * é separado apenas para nomear "Libertadores · 2º–6º*".
 *
 * Estas fronteiras são o baseline histórico G-6: o backtest walk-forward e os
 * rótulos fixos continuam usando-as. A projeção de produção resolve as zonas
 * efetivas por `resolveLibertadoresZones`, que desloca a linha de G-5 a G-9
 * conforme as devoluções de vaga das copas.
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
