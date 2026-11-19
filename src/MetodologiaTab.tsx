import type { JSX } from 'react'
import { MethodologyPanel } from './MethodologyPanel'
import { AuditPanel } from './AuditPanel'
import { useProjection } from './ProjectionContext'

/** Consome o worker compartilhado (um run para Projeções e Metodologia). */
function MethodologyConsumer(): JSX.Element {
  const { result, status, retry } = useProjection()
  return <MethodologyPanel result={result} status={status} onRetry={retry} />
}

/** Aba Metodologia & Auditoria — carregada sob demanda (React.lazy). */
export function MetodologiaTab(): JSX.Element {
  return (
    <>
      <MethodologyConsumer />
      <AuditPanel />
    </>
  )
}
