import { useMemo, useState } from 'react'

export type SortDirection = 'ascending' | 'descending'
export type SortAccessor<T> = (row: T) => number | string

export interface SortableColumn<T> {
  id: string
  header: string
  accessor: SortAccessor<T>
  numeric: boolean
}

/**
 * Ordenação de colunas acessível: alterna ascendente → descendente ao clicar
 * no cabeçalho e informa o estado via aria-sort.
 */
export function useTableSort<T>(rows: readonly T[], columns: readonly SortableColumn<T>[], initialColumnId: string, initialDirection: SortDirection = 'ascending') {
  const [sortColumnId, setSortColumnId] = useState(initialColumnId)
  const [direction, setDirection] = useState<SortDirection>(initialDirection)

  const sortedRows = useMemo(() => {
    const column = columns.find(({ id }) => id === sortColumnId) ?? columns[0]
    if (!column) return [...rows]
    const factor = direction === 'ascending' ? 1 : -1
    return [...rows].sort((left, right) => {
      const leftValue = column.accessor(left)
      const rightValue = column.accessor(right)
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * factor
      return String(leftValue).localeCompare(String(rightValue), 'pt-BR') * factor
    })
  }, [rows, columns, sortColumnId, direction])

  function toggleSort(columnId: string): void {
    if (columnId === sortColumnId) {
      setDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'))
      return
    }
    // Números: o interesse do usuário é quase sempre o maior primeiro (descendente);
    // posição e colunas de texto sobem do menor.
    const column = columns.find(({ id }) => id === columnId)
    setSortColumnId(columnId)
    setDirection(column?.numeric && columnId !== 'position' ? 'descending' : 'ascending')
  }

  function resetSort(): void {
    setSortColumnId(initialColumnId)
    setDirection(initialDirection)
  }

  function ariaSort(columnId: string): 'none' | SortDirection | undefined {
    return columnId === sortColumnId ? direction : 'none'
  }

  return { sortedRows, sortColumnId, direction, toggleSort, resetSort, ariaSort }
}
