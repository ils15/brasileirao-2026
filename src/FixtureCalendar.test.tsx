import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FixtureCalendar } from './FixtureCalendar'
import { remainingFixtures } from './projectionData'

describe('calendário e retrospecto por mando', () => {
  it('lista para o clube selecionado exatamente os fixtures usados na simulação', () => {
    render(<FixtureCalendar />)

    const calendar = screen.getByRole('region', { name: 'Calendário restante por clube' })
    expect(within(calendar).getByRole('heading', { name: 'Jogos de Flamengo' })).toBeInTheDocument()
    expect(within(calendar).getAllByRole('listitem').filter((item) => item.classList.contains('remaining-fixture'))).toHaveLength(
      remainingFixtures.filter(({ home, away }) => home === 'flamengo' || away === 'flamengo').length,
    )
    expect(within(calendar).getByText(/2026 · em casa/)).toBeInTheDocument()
    expect(within(calendar).getByText(/2021–2025 · fora/)).toBeInTheDocument()
    expect(within(calendar).getByText(/Sem índice de dificuldade/)).toBeInTheDocument()
  })

  it('atualiza calendário, mando e adversário por seleção acessível de clube', async () => {
    const user = userEvent.setup()
    render(<FixtureCalendar />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube para consultar calendário' }), 'palmeiras')

    const calendar = screen.getByRole('region', { name: 'Calendário restante por clube' })
    expect(within(calendar).getByRole('heading', { name: 'Jogos de Palmeiras' })).toBeInTheDocument()
    expect(within(calendar).getByText(/Adversário: Flamengo · jogo em casa/)).toBeInTheDocument()
    expect(within(calendar).queryByText(/Adversário: Athletico Paranaense/)).not.toBeInTheDocument()
  })

  it('mostra retrospecto H2H histórico e de 2026 como contexto, sem chamá-lo de previsão', async () => {
    const user = userEvent.setup()
    render(<FixtureCalendar />)
    const calendar = screen.getByRole('region', { name: 'Calendário restante por clube' })
    const fixture = calendar.querySelector<HTMLElement>('.remaining-fixture')
    expect(fixture).not.toBeNull()
    const fixtureView = within(fixture!)
    expect(fixtureView.getByText(/Retrospecto H2H · informativo; sem peso na projeção/)).toBeInTheDocument()
    // Chips compactos com ícone de mando (casa/fora)
    const miniGrid = fixtureView.getByLabelText('Estatísticas H2H de Flamengo contra Athletico Paranaense')
    expect(miniGrid.querySelectorAll('.h2h-mini')).toHaveLength(4)
    expect(miniGrid.textContent).toContain('2021–25 casa')
    expect(miniGrid.textContent).toContain('2026 fora')
    await user.click(fixtureView.getByText(/Placares do retrospecto/))
    const scores = fixtureView.getByRole('list', { name: 'Placares H2H de Flamengo e Athletico Paranaense' })
    expect(scores.querySelector('li')?.textContent).toContain('2026 · Athletico Paranaense 1–1 Flamengo')
  })
})
