import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeadToHeadPanel } from './HeadToHeadPanel'

describe('painel de confronto direto', () => {
  it('expõe anos desde 2003 com intervalo inicial padrão preservado em 2012', () => {
    render(<HeadToHeadPanel />)

    expect(screen.getByLabelText('Ano inicial do período')).toHaveValue('2012')
    expect(screen.getByLabelText('Ano inicial do período')).toHaveTextContent('2003')
    expect(screen.getByText(/OpenFootball CC0 em 2003–2011, Football-Data em 2012–2025/)).toBeInTheDocument()
    expect(screen.getByText(/Período 2012–2026/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Ano inicial do período'), { target: { value: '2003' } })

    expect(screen.getByText(/Período 2003–2026/)).toBeInTheDocument()
    expect(screen.getAllByText('OF').length).toBeGreaterThan(0)
  })

  it('filtra a timeline com o período selecionado', () => {
    render(<HeadToHeadPanel />)
    const timeline = screen.getByRole('list', { name: /Timeline de encontros/ })

    expect(within(timeline).queryByLabelText('Fonte: OpenFootball (CC0)')).not.toBeInTheDocument()
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(27)

    fireEvent.click(screen.getByRole('button', { name: 'Desde 2003' }))

    expect(within(timeline).getAllByLabelText('Fonte: OpenFootball (CC0)').length).toBeGreaterThan(0)
    expect(within(timeline).getAllByRole('listitem').length).toBeGreaterThan(27)
  })
})
