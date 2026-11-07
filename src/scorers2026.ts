/**
 * Artilharia 2026 — GERADO por scripts/refresh-apifutebolbr.mjs a partir da
 * API Futebol BR (campeonato 10, edição atual). NÃO EDITAR À MÃO.
 *
 * Fonte informativa: não alimenta o modelo de gols. Σgols de atletas ≈ gols
 * pró da tabela menos os gols contra; pequenas diferenças por clube são
 * esperadas e documentadas na auditoria (§19).
 */

export const SCORERS_SOURCE = {
  name: 'API Futebol BR',
  fetchedAt: '2026-11-07T15:53:19.657Z',
  sha256: 'd6f65e6dbec40f2fafd97fa5d3165fdbf9905e54e3c6c68c9d8b24f501bafae3',
} as const

export interface Scorer2026 {
  name: string
  club: string
  goals: number
}

export const scorers2026: readonly Scorer2026[] = [
  { name: 'Viveros', club: 'athletico-pr', goals: 21 },
  { name: 'Pedro', club: 'flamengo', goals: 20 },
  { name: 'Gabriel', club: 'santos', goals: 15 },
  { name: 'Kaio Jorge', club: 'cruzeiro', goals: 14 },
  { name: 'Samuel Lino', club: 'flamengo', goals: 12 },
  { name: 'Carlos Vinícius', club: 'gremio', goals: 11 },
  { name: 'Luciano Juba', club: 'bahia', goals: 11 },
  { name: 'Calleri', club: 'sao-paulo', goals: 10 },
  { name: 'Danilo', club: 'botafogo', goals: 10 },
  { name: 'José López', club: 'palmeiras', goals: 10 },
  { name: 'Mauricio', club: 'palmeiras', goals: 10 },
  { name: 'Renê', club: 'vitoria', goals: 10 },
  { name: 'Jajá', club: 'remo', goals: 9 },
  { name: 'John Kennedy', club: 'fluminense', goals: 9 },
  { name: 'Luciano', club: 'sao-paulo', goals: 9 },
  { name: 'Matheus Pereira', club: 'cruzeiro', goals: 9 },
  { name: 'Pedro Rocha', club: 'coritiba', goals: 9 },
  { name: 'Breno Lopes', club: 'coritiba', goals: 8 },
  { name: 'Neymar', club: 'santos', goals: 8 },
  { name: 'Arthur Cabral', club: 'botafogo', goals: 7 },
  { name: 'Carbonero', club: 'internacional', goals: 7 },
  { name: 'Carrascal', club: 'flamengo', goals: 7 },
  { name: 'Eduardo', club: 'mirassol', goals: 7 },
  { name: 'Hulk', club: 'fluminense', goals: 7 },
  { name: 'Lucas Barbosa', club: 'bragantino', goals: 7 },
  { name: 'Lucas Paquetá', club: 'flamengo', goals: 7 },
  { name: 'Savarino', club: 'fluminense', goals: 7 },
  { name: 'Alan Patrick', club: 'internacional', goals: 6 },
  { name: 'Arias', club: 'palmeiras', goals: 6 },
  { name: 'Canobbio', club: 'fluminense', goals: 6 },
]
