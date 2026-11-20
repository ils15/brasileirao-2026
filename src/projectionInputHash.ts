import { ADVANCED_STATS_SOURCE } from './advancedStats2026'
import { currentSeasonResults } from './currentSeasonResults'
import { currentClubs, remainingFixtures } from './projectionData'
import { ANALYTICAL_CUTOFF_UTC, filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'

/**
 * Identidade determinística das entradas da projeção Monte Carlo.
 *
 * O worker e os geradores (`scripts/generate-projections.mjs`) simulam a partir
 * dos mesmos módulos versionados; sem uma impressão digital não há como provar
 * que dois consumidores partiram do mesmo pacote. `computeProjectionInputHash`
 * devolve um FNV-1a de 64 bits em hex sobre uma serialização canônica, e é
 * **síncrona de propósito**: `crypto.subtle` é assíncrono e pode faltar em
 * contexto de teste/Node antigo.
 *
 * A serialização é o contrato — ordem fixa, separadores fixos, sem JSON (o JSON
 * depende da ordem de chaves do objeto de origem). Mudar o formato exige subir
 * a marca do cabeçalho, senão hashes antigos passam a colidir com novos: a
 * versão existe **justamente** para invalidar artefatos gerados sob outra
 * definição (`v2` = entradas + identidade da captura secundária de xG/cartões).
 */

/** Clube na forma canônica: só o que a simulação lê do pacote. */
export interface ProjectionHashClub {
  id: string
  position: number
  points: number
}

/** Partida pendente na forma canônica (rodada + par ordenado). */
export interface ProjectionHashFixture {
  round: string
  home: string
  away: string
}

/** Identidade da captura secundária (xG/cartões) que alimenta o modelo. */
export interface ProjectionHashAdvancedStats {
  /** Instante da captura publicada em `src/advancedStats2026.ts`. */
  fetchedAt: string
  /** Jogos do pacote com registro na fonte secundária. */
  matches: number
  /** Jogos do pacote que a fonte secundária deveria cobrir. */
  expected: number
}

/** Entradas canônicas do hash, isoladas para permitir teste sem mocks. */
export interface ProjectionHashInputs {
  cutoffUtc: string
  playedMatches: number
  clubs: readonly ProjectionHashClub[]
  fixtures: readonly ProjectionHashFixture[]
  advancedStats: ProjectionHashAdvancedStats
}

/** Comparação por code unit: `localeCompare` varia com o locale do runner. */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn
const HASH_HEADER = 'brasileirao-2026.projection-input.v2'

/**
 * Texto canônico: identidade da captura secundária (xG/cartões), corte,
 * partidas disputadas, clubes ordenados por id e partidas pendentes ordenadas
 * por (rodada, casa, fora).
 *
 * O xG entra em `estimateExpectedGoals`, então uma captura secundária diferente
 * muda as probabilidades simuladas — sem estar no texto, o hash aceitaria um
 * artefato gerado com outro xG. A ordenação não confia na ordem incidental dos
 * módulos: o updater reescreve `projectionData.ts` e uma reordenação cosmética
 * não pode mudar o hash.
 */
export function canonicalProjectionInput(inputs: ProjectionHashInputs): string {
  const clubs = [...inputs.clubs].sort((left, right) => compareText(left.id, right.id))
  const fixtures = [...inputs.fixtures].sort(
    (left, right) =>
      compareText(left.round, right.round)
      || compareText(left.home, right.home)
      || compareText(left.away, right.away),
  )
  const { fetchedAt, matches, expected } = inputs.advancedStats
  return [
    HASH_HEADER,
    `advanced=${fetchedAt}|${matches}/${expected}`,
    `cutoff=${inputs.cutoffUtc}`,
    `played=${inputs.playedMatches}`,
    ...clubs.map((club) => `club=${club.id}|${club.position}|${club.points}`),
    ...fixtures.map((fixture) => `fixture=${fixture.round}|${fixture.home}|${fixture.away}`),
  ].join('\n')
}

/** FNV-1a de 64 bits sobre UTF-8, em hex de 16 dígitos. */
export function fnv1a64Hex(text: string): string {
  let hash = FNV_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(text)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

/** Hash das entradas informadas; a função pura usada pelos testes. */
export function hashProjectionInputs(inputs: ProjectionHashInputs): string {
  return fnv1a64Hex(canonicalProjectionInput(inputs))
}

/**
 * Hash do pacote vigente. Chamado pelo app e pelo gerador: os dois leem os
 * mesmos módulos, então o valor tem que bater byte a byte.
 */
export function computeProjectionInputHash(): string {
  return hashProjectionInputs({
    cutoffUtc: ANALYTICAL_CUTOFF_UTC,
    playedMatches: filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).length,
    clubs: currentClubs,
    fixtures: remainingFixtures,
    advancedStats: {
      fetchedAt: ADVANCED_STATS_SOURCE.fetchedAt,
      matches: ADVANCED_STATS_SOURCE.coverage.matches,
      expected: ADVANCED_STATS_SOURCE.coverage.expected,
    },
  })
}
