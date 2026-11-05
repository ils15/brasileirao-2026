import { createContext, useContext, useEffect, useState, type JSX, type ReactNode } from 'react'
import type { ProjectionResult } from './projection'

export type ProjectionStatus = 'loading' | 'ready' | 'error'

interface ProjectionContextValue {
  result: ProjectionResult | null
  status: ProjectionStatus
  retry: () => void
}

const ProjectionContext = createContext<ProjectionContextValue | null>(null)

/**
 * Um único Web Worker de projeção compartilhado pelas abas Projeções e
 * Metodologia & Validação — as 20.000 simulações rodam uma vez, não duas.
 */
export function ProjectionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [result, setResult] = useState<ProjectionResult | null>(null)
  const [status, setStatus] = useState<ProjectionStatus>('loading')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setStatus('error')
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      setStatus('error')
      return
    }
    setStatus('loading')
    worker.onmessage = (event: MessageEvent<ProjectionResult>): void => {
      setResult(event.data)
      setStatus('ready')
      worker.terminate()
    }
    worker.onerror = (): void => {
      setStatus('error')
      worker.terminate()
    }
    worker.postMessage({ type: 'run' })
    return () => worker.terminate()
  }, [retryCount])

  const value: ProjectionContextValue = { result, status, retry: () => setRetryCount((count) => count + 1) }
  return <ProjectionContext.Provider value={value}>{children}</ProjectionContext.Provider>
}

export function useProjection(): ProjectionContextValue {
  const value = useContext(ProjectionContext)
  if (!value) throw new Error('useProjection precisa estar dentro de ProjectionProvider.')
  return value
}
