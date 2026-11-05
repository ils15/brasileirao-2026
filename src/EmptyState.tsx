import type { JSX, ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  children?: ReactNode
}

/** Estado vazio padronizado para filtros sem resultados e listas vazias. */
export function EmptyState({ title, description, children }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state-card" role="status">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-description">{description}</p>
      {children}
    </div>
  )
}
