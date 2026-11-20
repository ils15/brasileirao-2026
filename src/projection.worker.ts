import { runProjectionRaw, type RawProjectionResult } from './projection'
import {
  BACKTEST_SIMULATIONS,
  DEV_BACKTEST_SIMULATIONS,
  DEV_SIMULATION_COUNT,
  SIMULATION_COUNT,
} from './projectionConfig'

/**
 * Contrato main thread → worker: uma única execução Monte Carlo. O cenário não
 * viaja mais para o worker — ele é derivado do resultado bruto em `useMemo`.
 */
export type ProjectionRequest = { type: 'run' }

/**
 * Único lugar do código que lê `import.meta.env`: em `serve` o Monte Carlo e o
 * backtest rodam com orçamento reduzido para o ciclo de edição ser curto; no
 * build de produção valem as constantes canônicas. As funções de biblioteca
 * recebem os números por parâmetro, então os testes não dependem do ambiente.
 */
const simulations = import.meta.env.DEV ? DEV_SIMULATION_COUNT : SIMULATION_COUNT
const backtestSimulations = import.meta.env.DEV ? DEV_BACKTEST_SIMULATIONS : BACKTEST_SIMULATIONS

interface WorkerScope {
  onmessage: ((event: MessageEvent<ProjectionRequest>) => void) | null
  postMessage: (result: RawProjectionResult) => void
}

const workerScope = self as unknown as WorkerScope
workerScope.onmessage = (): void => {
  workerScope.postMessage(runProjectionRaw({ simulations, backtestSimulations }))
}
