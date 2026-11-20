import type { FeatureBacktest } from './modelBacktest'
import type { PointOutcomeCurveSnapshot } from './pointCurve'
import type { PointsStats } from './pointsDistribution'
import type { BacktestSummary } from './projection'
import type { PointsPositionCounts, RawClubProjection, RawProjectionResult } from './projectionDerived'

/**
 * Leitura do artefato publicado em `public/projecoes.json`.
 *
 * O schema é **duplicado** de `scripts/lib/projectionsJson.mjs`: o gerador roda
 * em Node/ESM e não pode importar TypeScript, então os dois lados descrevem o
 * mesmo documento. `schemaVersion` é o contrato entre eles — qualquer mudança
 * de forma sobe a marca nos dois arquivos ou o cliente descarta o artefato.
 * A versão 2 publica `pointCurve`, o agregado `pontuação → máscara de posições
 * → simulações`; é dele que saem os ICs cluster-robustos, sem síntese.
 *
 * Toda função aqui é defensiva de propósito: o arquivo vem da rede (mesmo que
 * do próprio site) e um documento truncado, velho ou adulterado não pode virar
 * tela de erro. `null` significa "não confie neste documento" e o chamador cai
 * no caminho do Web Worker.
 */

/** Versão do contrato deste arquivo; igual a `PROJECTIONS_SCHEMA_VERSION` do gerador. */
export const PROJECTIONS_SNAPSHOT_SCHEMA_VERSION = 2

/** Posições possíveis na tabela; índice 0 sem uso, como no resto do app. */
const POSITION_SLOTS = 21

/** Clubes da Série A. */
const CLUB_COUNT = 20

/** Máscaras da curva usam 20 bits, bit 0 = 1º lugar (vem de `pointCurve.ts`). */
const POINT_CURVE_MASK_LIMIT = 2 ** CLUB_COUNT

/** As 2^4 devoluções de vaga da Libertadores. */
const SCENARIO_COUNT = 16

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** Vetor de contagens inteiras ≥ 0 com o tamanho exato do contrato. */
function isCountSlots(value: unknown, length: number): value is number[] {
  return Array.isArray(value)
    && value.length === length
    && value.every((count) => isInteger(count) && count >= 0)
}

/** Máscara de posições: inteiro que cabe nos 20 bits da tabela. */
function isMaskSlots(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((mask) => isInteger(mask) && mask >= 0 && mask < POINT_CURVE_MASK_LIMIT)
}

function isGoalAverages(value: unknown): value is { home: number; away: number } {
  if (!isRecord(value)) return false
  return isFiniteNumber(value.home) && isFiniteNumber(value.away)
}

function parsePointsStats(value: unknown): PointsStats | null {
  if (!isRecord(value)) return null
  const { samples, mean, median, stdDev, min, max, p10, p25, p75, p90 } = value
  if (!isInteger(samples) || samples < 0) return null
  if (!isFiniteNumber(mean) || !isFiniteNumber(median) || !isFiniteNumber(stdDev)) return null
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return null
  if (!isFiniteNumber(p10) || !isFiniteNumber(p25) || !isFiniteNumber(p75) || !isFiniteNumber(p90)) return null
  return { samples, mean, median, stdDev, min, max, p10, p25, p75, p90 }
}

/**
 * As 16 combinações precisam vir na ordem do bitmask (`scenarioKey === índice`),
 * com contagens inteiras. O cliente não usa essas linhas — `deriveProjectionResult`
 * as recalcula de `positionCounts` — mas um documento incoerente aqui indica
 * gerador quebrado e derruba a confiança no resto.
 */
function isScenarioCounts(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== SCENARIO_COUNT) return false
  return value.every((entry, index) => {
    if (!isRecord(entry)) return false
    if (entry.scenarioKey !== index) return false
    const counts = [entry.libertadoresTo, entry.directTo, entry.libertadores, entry.direct]
    return counts.every((count) => isInteger(count) && count >= 0)
  })
}

function parseClub(value: unknown, simulations: number): RawClubProjection | null {
  if (!isRecord(value)) return null
  const { id, club, currentPosition, currentPoints, positionCounts, scenarioCounts, pointsStats } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof club !== 'string' || club.length === 0) return null
  if (!isInteger(currentPosition) || !isInteger(currentPoints)) return null
  if (!isCountSlots(positionCounts, POSITION_SLOTS)) return null
  const positions = positionCounts.reduce((total, count) => total + count, 0)
  if (positions !== simulations) return null
  if (!isScenarioCounts(scenarioCounts)) return null
  const stats = parsePointsStats(pointsStats)
  if (stats === null) return null
  return {
    id,
    club,
    currentPosition,
    currentPoints,
    positionCounts: [...positionCounts],
    pointsStats: stats,
  }
}

/**
 * Tabela global pontos × posição. A soma de todas as linhas é
 * `simulations × clubes`, o mesmo invariante que o gerador verifica antes de
 * publicar; divergência aqui é documento corrompido, não dado novo.
 */
function parsePointsByPosition(value: unknown, simulations: number): PointsPositionCounts[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const rows: PointsPositionCounts[] = []
  let observations = 0
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const { points, positionCounts } = entry
    if (!isInteger(points)) return null
    if (!isCountSlots(positionCounts, POSITION_SLOTS)) return null
    observations += positionCounts.reduce((total, count) => total + count, 0)
    rows.push({ points, positionCounts: [...positionCounts] })
  }
  return observations === simulations * CLUB_COUNT ? rows : null
}

/**
 * Resumos walk-forward (`backtest`/`featureBacktest`) são renderizados campo a
 * campo pela aba Metodologia e não alimentam nenhum número da projeção. A
 * guarda fica estrutural: objeto com `seasons`; repetir aqui as dezenas de
 * campos do gerador criaria um terceiro schema para manter em sincronia.
 */
function parseBacktestSummary(value: unknown): BacktestSummary | null {
  if (!isRecord(value) || !Array.isArray(value.seasons)) return null
  return value as unknown as BacktestSummary
}

function parseFeatureBacktest(value: unknown): FeatureBacktest | null {
  if (!isRecord(value) || !Array.isArray(value.seasons)) return null
  return value as unknown as FeatureBacktest
}

/**
 * Agregado bruto da curva publicado no schema 2 (`pontuação → máscara de
 * posições → simulações`). É a fonte dos ICs cluster-robustos: cada máscara
 * carrega os clubes que caíram juntos na mesma temporada simulada.
 *
 * A forma sozinha não prova nada — um arquivo pode publicar máscaras
 * arbitrárias. A prova é a expansão: somando os bits de cada máscara por
 * posição e ponderando pela contagem, o resultado tem de reproduzir
 * `pointsByPosition` exatamente, pontuação a pontuação, e fechar
 * `simulations × clubes`. É a mesma checagem que o gerador faz antes de
 * publicar, repetida aqui porque o documento chega pela rede.
 */
function parsePointCurve(
  value: unknown,
  simulations: number,
  rows: readonly PointsPositionCounts[],
): PointOutcomeCurveSnapshot | null {
  if (!isRecord(value)) return null
  const { simulationCount, points, masks, counts } = value
  if (!isInteger(simulationCount) || simulationCount !== simulations) return null
  if (!Array.isArray(points) || points.length === 0) return null
  if (!Array.isArray(masks) || masks.length !== points.length) return null
  if (!Array.isArray(counts) || counts.length !== points.length) return null

  const parsedPoints: number[] = []
  const parsedMasks: number[][] = []
  const parsedCounts: number[][] = []
  const expansionByPoints = new Map<number, number[]>()

  for (let index = 0; index < points.length; index += 1) {
    const pointsValue: unknown = points[index]
    const maskRow: unknown = masks[index]
    const countRow: unknown = counts[index]
    if (!isInteger(pointsValue) || pointsValue < 0) return null
    // Duas linhas para a mesma pontuação tornariam a curva ambígua.
    if (expansionByPoints.has(pointsValue)) return null
    if (!isMaskSlots(maskRow) || maskRow.length === 0) return null
    if (!isCountSlots(countRow, maskRow.length)) return null

    const expansion = new Array<number>(POSITION_SLOTS).fill(0)
    maskRow.forEach((mask, maskIndex) => {
      const times = countRow[maskIndex]!
      for (let position = 1; position < POSITION_SLOTS; position += 1) {
        if ((mask & (1 << (position - 1))) !== 0) expansion[position]! += times
      }
    })

    parsedPoints.push(pointsValue)
    parsedMasks.push([...maskRow])
    parsedCounts.push([...countRow])
    expansionByPoints.set(pointsValue, expansion)
  }

  let expandedTotal = 0
  for (const row of rows) {
    const expansion = expansionByPoints.get(row.points)
    if (!expansion) return null
    for (let position = 1; position < POSITION_SLOTS; position += 1) {
      if (expansion[position] !== row.positionCounts[position]) return null
      expandedTotal += expansion[position]!
    }
  }
  // Pontuação publicada só em máscaras (sem linha marginal) também é incoerência.
  if (expansionByPoints.size !== rows.length) return null
  if (expandedTotal !== simulations * CLUB_COUNT) return null

  return {
    simulationCount,
    points: parsedPoints,
    masks: parsedMasks,
    counts: parsedCounts,
  }
}

/** Snapshot validado, com os dois campos que não pertencem a `RawProjectionResult`. */
export interface ProjectionsSnapshot {
  readonly raw: RawProjectionResult
  readonly generatedAt: string
  readonly inputHash: string
}

/**
 * Valida o documento e converte para o shape do worker. Devolve `null` — nunca
 * lança — em qualquer inconsistência: versão desconhecida, contagens fora do
 * contrato, clubes faltando, tabela global incompleta ou `pointCurve` que não
 * reproduz as marginais.
 *
 * `generatedAt` e `inputHash` sobrevivem porque o contexto precisa deles: o
 * carimbo vira o rótulo de proveniência na UI e o hash é a guarda de
 * obsolescência contra o pacote deste build.
 */
export function parseProjectionsSnapshotEntry(value: unknown): ProjectionsSnapshot | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== PROJECTIONS_SNAPSHOT_SCHEMA_VERSION) return null

  const { simulations, seed, backtestSimulations, inputHash, generatedAt, analyticalCutoffUtc, model } = value
  if (!isInteger(simulations) || simulations <= 0) return null
  if (!isInteger(seed)) return null
  if (!isInteger(backtestSimulations) || backtestSimulations <= 0) return null
  if (typeof inputHash !== 'string' || inputHash.length === 0) return null
  if (!isIsoDate(generatedAt) || !isIsoDate(analyticalCutoffUtc)) return null
  if (!isRecord(model) || !isGoalAverages(model.leagueAverageGoals) || !isGoalAverages(model.trainingGoalAverages)) {
    return null
  }

  const clubs = value.clubs
  if (!Array.isArray(clubs) || clubs.length !== CLUB_COUNT) return null
  const parsedClubs: RawClubProjection[] = []
  for (const club of clubs) {
    const parsed = parseClub(club, simulations)
    if (parsed === null) return null
    parsedClubs.push(parsed)
  }

  const pointsByPosition = parsePointsByPosition(value.pointsByPosition, simulations)
  if (pointsByPosition === null) return null

  const pointCurve = parsePointCurve(value.pointCurve, simulations, pointsByPosition)
  if (pointCurve === null) return null

  const backtest = parseBacktestSummary(value.backtest)
  const featureBacktest = parseFeatureBacktest(value.featureBacktest)
  if (backtest === null || featureBacktest === null) return null

  return {
    generatedAt,
    inputHash,
    raw: {
      simulations,
      seed,
      clubs: parsedClubs,
      pointCurve,
      pointsByPosition,
      leagueAverageGoals: { home: model.leagueAverageGoals.home, away: model.leagueAverageGoals.away },
      trainingGoalAverages: { home: model.trainingGoalAverages.home, away: model.trainingGoalAverages.away },
      backtest,
      featureBacktest,
    },
  }
}

/** Atalho para o consumidor que só quer o resultado bruto. */
export function parseProjectionsSnapshot(value: unknown): RawProjectionResult | null {
  return parseProjectionsSnapshotEntry(value)?.raw ?? null
}
