/**
 * Montagem e serialização de `public/projecoes.json`.
 *
 * Módulo puro (sem I/O, sem rede, sem `src/`) porque o schema não pode depender
 * de TypeScript: o gerador carrega `src/` pelo Vite SSR, mas o teste e qualquer
 * consumidor validam o documento com as mesmas funções.
 *
 * Contrato: **contagens inteiras**, nunca percentual arredondado. Quem consome
 * divide por `simulations`. Arredondar aqui destruiria a exatidão que justifica
 * publicar o arquivo (ver `docs/projecoes-json.md`).
 */

export const PROJECTIONS_SCHEMA_VERSION = 2

/** Caminho publicado pelo Vite (`public/` é copiado para `dist/`). */
export const DEFAULT_OUTPUT = 'public/projecoes.json'

/** Posições possíveis na tabela; índice 0 fica sem uso, como no resto do app. */
export const POSITION_SLOTS = 21

/** Clubes da Série A; base do total de clubes-temporada publicado. */
const CLUB_COUNT = 20

/** Máscaras da curva usam 20 bits, bit 0 = 1º lugar. */
const POINT_CURVE_MASK_LIMIT = 2 ** CLUB_COUNT

/** As 2^4 devoluções de vaga da Libertadores. */
export const SCENARIO_COUNT = 16

const CLUB_FIELDS = [
  'id',
  'club',
  'currentPosition',
  'currentPoints',
  'positionCounts',
  'scenarioCounts',
  'pointsStats',
]

/**
 * Documento publicado.
 *
 * Duas diferenças deliberadas em relação ao agregado do worker:
 * - `pointsPositionCounts` do boletim original era por clube, mas a simulação
 *   acumula pontos × posição **globalmente** (`raw.pointsByPosition`). Inventar
 *   a tabela por clube exigiria uma segunda passada de 500 mil simulações para
 *   publicar um corte que ninguém consome; o documento publica a tabela global
 *   e, por clube, o resumo `pointsStats` que o worker já calculou.
 * - `generatedAt` é o carimbo do pacote de dados (`CURRENT_SEASON_PACK_GENERATED_AT`),
 *   não o relógio da execução: duas execuções sobre o mesmo pacote produzem
 *   bytes idênticos e o gate `changed` do updater continua limpo.
 * - `pointCurve` (schema 2) publica o agregado `pontuação → máscara de posições
 *   → simulações`. As contagens marginais não carregam a correlação entre clubes
 *   dentro de uma mesma temporada; sem ela o cliente só consegue ICs de
 *   independência, mais estreitos que o cluster-robusto do worker. O agregado
 *   custa ~5 KB em 500 mil simulações (64 pontuações, 497 máscaras) e devolve a
 *   curva exata por `buildPointOutcomeCurveFromSnapshot`.
 *
 * @param {{
 *   raw: { simulations: number, seed: number, clubs: ReadonlyArray<Record<string, unknown>>,
 *     pointCurve: { simulationCount: number, points: readonly number[],
 *       masks: ReadonlyArray<readonly number[]>, counts: ReadonlyArray<readonly number[]> },
 *     pointsByPosition: ReadonlyArray<{ points: number, positionCounts: number[] }>,
 *     leagueAverageGoals: unknown, trainingGoalAverages: unknown,
 *     backtest: unknown, featureBacktest: unknown },
 *   scenarioCounts: (positionCounts: readonly number[]) => ReadonlyArray<Record<string, unknown>>,
 *   cutoffUtc: string,
 *   generatedAt: string,
 *   inputHash: string,
 *   backtestSimulations: number,
 * }} input
 */
export function buildProjectionsDocument({
  raw,
  scenarioCounts,
  cutoffUtc,
  generatedAt,
  inputHash,
  backtestSimulations,
}) {
  return {
    schemaVersion: PROJECTIONS_SCHEMA_VERSION,
    generatedAt,
    simulations: raw.simulations,
    seed: raw.seed,
    backtestSimulations,
    analyticalCutoffUtc: cutoffUtc,
    inputHash,
    model: {
      leagueAverageGoals: raw.leagueAverageGoals,
      trainingGoalAverages: raw.trainingGoalAverages,
    },
    clubs: raw.clubs.map((club) => ({
      id: club.id,
      club: club.club,
      currentPosition: club.currentPosition,
      currentPoints: club.currentPoints,
      positionCounts: [...club.positionCounts],
      scenarioCounts: scenarioCounts(club.positionCounts),
      pointsStats: { ...club.pointsStats },
    })),
    pointsByPosition: raw.pointsByPosition.map((row) => ({
      points: row.points,
      positionCounts: [...row.positionCounts],
    })),
    // Arrays paralelos de inteiros, sem repetir chaves por item: 64 pontuações e
    // menos de 500 máscaras em 500 mil simulações. Nada de `{ mask, count }`.
    pointCurve: {
      simulationCount: raw.pointCurve.simulationCount,
      points: [...raw.pointCurve.points],
      masks: raw.pointCurve.masks.map((masks) => [...masks]),
      counts: raw.pointCurve.counts.map((counts) => [...counts]),
    },
    backtest: raw.backtest,
    featureBacktest: raw.featureBacktest,
  }
}

/** JSON estável: chaves na ordem de construção, 2 espaços, newline final. */
export function serializeProjectionsDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * Checagem estrutural de `pointCurve`: arrays paralelos de inteiros, pontuações
 * em ordem crescente e máscaras dentro dos 20 bits da tabela.
 *
 * @param {any} snapshot
 * @param {number} simulations
 * @returns {string[]}
 */
function pointCurveShapeProblems(snapshot, simulations) {
  const problems = []
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return ['pointCurve ausente ou não é objeto']
  }
  if (!Number.isInteger(snapshot.simulationCount) || snapshot.simulationCount < 1) {
    problems.push('pointCurve.simulationCount inválido')
  } else if (snapshot.simulationCount !== simulations) {
    problems.push(`pointCurve.simulationCount ${snapshot.simulationCount} ≠ simulations ${simulations}`)
  }
  const { points, masks, counts } = snapshot
  if (!Array.isArray(points) || points.length === 0) return [...problems, 'pointCurve.points ausente ou vazio']
  if (!Array.isArray(masks) || masks.length !== points.length) {
    return [...problems, 'pointCurve.masks não acompanha points']
  }
  if (!Array.isArray(counts) || counts.length !== points.length) {
    return [...problems, 'pointCurve.counts não acompanha points']
  }

  let previous = -Infinity
  points.forEach((pointsValue, index) => {
    const label = `pointCurve[${index}]`
    if (!Number.isInteger(pointsValue) || pointsValue < 0) problems.push(`${label}.points não é inteiro ≥ 0`)
    if (pointsValue <= previous) problems.push(`${label}.points fora de ordem crescente`)
    previous = pointsValue
    const maskRow = masks[index]
    const countRow = counts[index]
    if (!Array.isArray(maskRow) || maskRow.length === 0) return problems.push(`${label}.masks vazio`)
    if (!Array.isArray(countRow) || countRow.length !== maskRow.length) {
      return problems.push(`${label}.counts não acompanha masks`)
    }
    maskRow.forEach((mask, maskIndex) => {
      if (!Number.isInteger(mask) || mask <= 0 || mask >= POINT_CURVE_MASK_LIMIT) {
        problems.push(`${label}.masks[${maskIndex}] não é máscara de ${CLUB_COUNT} bits`)
      }
      const count = countRow[maskIndex]
      if (!Number.isInteger(count) || count < 1) problems.push(`${label}.counts[${maskIndex}] não é inteiro ≥ 1`)
    })
  })
  return problems
}

/**
 * Prova que o agregado de máscaras reproduz `pointsByPosition`: para cada
 * pontuação, os bits de cada máscara expandidos por posição têm de bater
 * exatamente com as contagens marginais, e o total tem de fechar
 * `simulations × clubes`. É essa correlação dentro da simulação que os ICs
 * cluster-robustos usam — sem ela o arquivo publicado mentiria o rótulo.
 *
 * @param {{ points: readonly number[], masks: ReadonlyArray<readonly number[]>,
 *   counts: ReadonlyArray<readonly number[]> }} snapshot
 * @param {ReadonlyArray<{ points: number, positionCounts: number[] }>} rows
 * @param {number} simulations
 * @param {number} clubCount
 * @returns {string[]}
 */
function pointCurveExpansionProblems(snapshot, rows, simulations, clubCount) {
  const problems = []
  const expectedByPoints = new Map(rows.map((row) => [row.points, row.positionCounts]))
  const expandedPoints = new Set()
  let expandedTotal = 0

  snapshot.points.forEach((points, index) => {
    expandedPoints.add(points)
    const expected = expectedByPoints.get(points)
    if (!expected) {
      problems.push(`pointCurve: pontuação ${points} ausente de pointsByPosition`)
      return
    }
    const expansion = new Array(POSITION_SLOTS).fill(0)
    snapshot.masks[index].forEach((mask, maskIndex) => {
      const times = snapshot.counts[index][maskIndex]
      for (let position = 1; position <= CLUB_COUNT; position += 1) {
        if ((mask & (1 << (position - 1))) !== 0) expansion[position] += times
      }
    })
    let matches = true
    for (let position = 1; position <= CLUB_COUNT; position += 1) {
      expandedTotal += expansion[position]
      if (expansion[position] !== expected[position]) matches = false
    }
    if (!matches) problems.push(`pointCurve não reproduz pointsByPosition em ${points} pontos`)
  })

  for (const points of expectedByPoints.keys()) {
    if (!expandedPoints.has(points)) problems.push(`pointsByPosition ${points} pontos não tem máscaras em pointCurve`)
  }
  const expectedTotal = simulations * clubCount
  if (expandedTotal !== expectedTotal) {
    problems.push(`pointCurve expande ${expandedTotal} clubes-temporada, esperado ${expectedTotal}`)
  }
  return problems
}

/**
 * Guarda do contrato. Devolve a lista de problemas (vazia = documento válido)
 * em vez de lançar, para o teste relatar todos de uma vez; o gerador lança com
 * a lista, então um acumulador quebrado nunca publica arquivo.
 */
export function validateProjectionsDocument(document) {
  const problems = []
  const number = (value) => typeof value === 'number' && Number.isFinite(value)

  if (document === null || typeof document !== 'object') return ['documento não é objeto']
  if (document.schemaVersion !== PROJECTIONS_SCHEMA_VERSION) {
    problems.push(`schemaVersion ${String(document.schemaVersion)} ≠ ${PROJECTIONS_SCHEMA_VERSION}`)
  }
  if (typeof document.generatedAt !== 'string' || Number.isNaN(Date.parse(document.generatedAt))) {
    problems.push('generatedAt ausente ou não é data ISO')
  }
  if (!Number.isInteger(document.simulations) || document.simulations < 1) problems.push('simulations inválido')
  if (!Number.isInteger(document.seed)) problems.push('seed inválido')
  if (!Number.isInteger(document.backtestSimulations) || document.backtestSimulations < 1) {
    problems.push('backtestSimulations inválido')
  }
  if (typeof document.analyticalCutoffUtc !== 'string' || Number.isNaN(Date.parse(document.analyticalCutoffUtc))) {
    problems.push('analyticalCutoffUtc ausente ou não é data ISO')
  }
  if (typeof document.inputHash !== 'string' || !/^[0-9a-f]{16}$/.test(document.inputHash)) {
    problems.push('inputHash não é hex de 16 dígitos')
  }
  // Schema 2 publica o agregado de máscaras da curva de pontos. Sem ele o
  // cliente não reproduz os ICs cluster-robustos, só uma síntese marginal.
  let pointCurveValid = false
  if (Number.isInteger(document.schemaVersion) && document.schemaVersion >= 2) {
    const shape = pointCurveShapeProblems(document.pointCurve, document.simulations)
    problems.push(...shape)
    pointCurveValid = shape.length === 0
  }
  if (document.model === null || typeof document.model !== 'object') {
    problems.push('model ausente')
  } else {
    for (const key of ['leagueAverageGoals', 'trainingGoalAverages']) {
      const value = document.model[key]
      if (value === null || typeof value !== 'object' || !number(value.home) || !number(value.away)) {
        problems.push(`model.${key} sem home/away numéricos`)
      }
    }
  }

  if (!Array.isArray(document.clubs) || document.clubs.length === 0) {
    problems.push('clubs ausente ou vazio')
    return problems
  }

  const simulations = document.simulations
  document.clubs.forEach((club, index) => {
    const label = `clubs[${index}]`
    for (const field of CLUB_FIELDS) {
      if (!(field in club)) problems.push(`${label}.${field} ausente`)
    }
    const counts = club.positionCounts
    if (!Array.isArray(counts) || counts.length !== POSITION_SLOTS) {
      problems.push(`${label}.positionCounts não tem ${POSITION_SLOTS} posições`)
    } else {
      const sum = counts.reduce((total, value) => total + value, 0)
      if (sum !== simulations) problems.push(`${label}.positionCounts soma ${sum}, esperado ${simulations}`)
      counts.forEach((value, position) => {
        if (!Number.isInteger(value) || value < 0) problems.push(`${label}.positionCounts[${position}] não é inteiro ≥ 0`)
      })
    }
    const scenarios = club.scenarioCounts
    if (!Array.isArray(scenarios) || scenarios.length !== SCENARIO_COUNT) {
      problems.push(`${label}.scenarioCounts não tem ${SCENARIO_COUNT} entradas`)
    } else {
      scenarios.forEach((scenario, scenarioIndex) => {
        if (scenario.scenarioKey !== scenarioIndex) {
          problems.push(`${label}.scenarioCounts[${scenarioIndex}].scenarioKey ≠ ${scenarioIndex}`)
        }
        for (const field of ['libertadores', 'direct', 'libertadoresTo', 'directTo']) {
          if (!Number.isInteger(scenario[field])) problems.push(`${label}.scenarioCounts[${scenarioIndex}].${field} inválido`)
        }
      })
    }
    for (const field of ['currentPosition', 'currentPoints']) {
      if (!Number.isInteger(club[field])) problems.push(`${label}.${field} não é inteiro`)
    }
  })

  if (!Array.isArray(document.pointsByPosition) || document.pointsByPosition.length === 0) {
    problems.push('pointsByPosition ausente ou vazio')
  } else {
    let rowsTotal = 0
    let rowsValid = true
    document.pointsByPosition.forEach((row, index) => {
      if (!Number.isInteger(row.points)) problems.push(`pointsByPosition[${index}].points não é inteiro`)
      if (!Array.isArray(row.positionCounts) || row.positionCounts.length !== POSITION_SLOTS) {
        problems.push(`pointsByPosition[${index}].positionCounts não tem ${POSITION_SLOTS} posições`)
        rowsValid = false
        return
      }
      rowsTotal += row.positionCounts.reduce((total, value) => total + value, 0)
    })
    const expected = simulations * document.clubs.length
    if (rowsTotal !== expected) problems.push(`pointsByPosition soma ${rowsTotal}, esperado ${expected}`)
    // Só faz sentido expandir máscaras quando as duas metades estão íntegras.
    if (rowsValid && pointCurveValid) {
      problems.push(
        ...pointCurveExpansionProblems(document.pointCurve, document.pointsByPosition, simulations, document.clubs.length),
      )
    }
  }

  return problems
}
