import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SCORERS_SOURCE } from './data'
import { ScorersPanel } from './ScorersPanel'
import type { Scorer } from './data'

const source = SCORERS_SOURCE

const sample: Scorer[] = [
  { position: '1º', name: 'Kevin Viveros', club: 'Athletico Paranaense', goals: 21 },
  { position: '2º', name: 'Pedro', club: 'Flamengo', goals: 20 },
]

describe('painel de artilharia', () => {
  it('declara indisponibilidade em vez de paginar uma lista vazia', () => {
    render(<ScorersPanel scorers={[]} source={source} />)

    const panel = screen.getByRole('region', { name: 'Artilharia' })
    expect(within(panel).getByRole('status')).toHaveTextContent('Artilharia indisponível nesta captura')
    expect(within(panel).queryByRole('list', { name: 'Artilharia' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('navigation', { name: 'Paginação da artilharia' })).not.toBeInTheDocument()
    expect(within(panel).getByText(new RegExp(source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('renderiza atletas recebidos e mantém a paginação sobre a lista real', () => {
    render(<ScorersPanel scorers={sample} source={source} />)

    const panel = screen.getByRole('region', { name: 'Artilharia' })
    const list = within(panel).getByRole('list', { name: 'Artilharia' })
    expect(list.querySelectorAll('.scorer-item')).toHaveLength(sample.length)
    expect(within(list).getByText('Kevin Viveros')).toBeInTheDocument()
    expect(within(panel).getByRole('navigation', { name: 'Paginação da artilharia' })).toHaveTextContent(
      `1–${sample.length} de ${sample.length}`,
    )
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
  })
})
