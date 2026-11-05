import { runProjection } from './projection'

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (result: ReturnType<typeof runProjection>) => void
}

const workerScope = self as unknown as WorkerScope
workerScope.onmessage = (): void => {
  workerScope.postMessage(runProjection())
}
