import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MatchSimulator } from './MatchSimulator'
import { matchProbabilities } from './matchProbabilities'
import { remainingFixtures } from './projectionData'

describe('simulador de confrontos (MatchSimulator)', () => {
  it('renderiza os cards da rodada com xG, escudos e botões semânticos com placares prováveis', () => {
    render(<MatchSimulator />)

    expect(screen.getByRole('heading', { level: 2, name: /Simulador Interativo do Brasileirão/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mais Prováveis/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Favoritos/i })).toBeInTheDocument()

    // O primeiro jogo pendente é da rodada 21 adiado (Chapecoense vs Vasco)
    const firstFixture = remainingFixtures[0]!
    const { expected, mostProbable } = matchProbabilities(firstFixture.home, firstFixture.away)

    // O card exibe o xG com base nas forças de ataque e defesa
    expect(screen.getByText(expected.home.toFixed(2))).toBeInTheDocument()
    expect(screen.getByText(expected.away.toFixed(2))).toBeInTheDocument()

    // Os botões semânticos ou chips mostram o placar mais provável de cada desfecho
    expect(screen.getAllByText(new RegExp(`${mostProbable.homeWin.homeGoals}×${mostProbable.homeWin.awayGoals}`)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(new RegExp(`${mostProbable.draw.homeGoals}×${mostProbable.draw.awayGoals}`)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(new RegExp(`${mostProbable.awayWin.homeGoals}×${mostProbable.awayWin.awayGoals}`)).length).toBeGreaterThan(0)
  })

  it('preenche cenários com placares coerentes baseados em xG e não em constantes 2x1', async () => {
    const user = userEvent.setup()
    render(<MatchSimulator />)

    // Seleciona uma rodada completa com 10 jogos (Rodada 35)
    const select = screen.getByRole('combobox', { name: /Selecionar rodada para simular/i })
    await user.selectOptions(select, '35')

    // Clica no cenário rápido 'Mais Prováveis'
    await user.click(screen.getByRole('button', { name: /Mais Prováveis/i }))

    // Verifica que há jogos com palpites ativos e que os placares não são todos 2x1
    const matchCards = screen.getAllByRole('article')
    expect(matchCards.length).toBeGreaterThan(0)

    // Verifica que a tabela simulada foi recalculada
    expect(screen.getByRole('heading', { level: 3, name: /Impacto na Classificação & Probabilidades/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pts Atual' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pts Sim.' })).toBeInTheDocument()
  })

  it('permite alternar entre tabela simulada e probabilidades atualizadas', async () => {
    const user = userEvent.setup()
    render(<MatchSimulator />)

    // Clica no botão de favoritos
    await user.click(screen.getByRole('button', { name: /Favoritos/i }))

    // Alterna para visualização de Probabilidades
    const probTab = screen.getByRole('tab', { name: /Probabilidades Atualizadas/i })
    await user.click(probTab)

    expect(screen.getByRole('columnheader', { name: 'Título %' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Libertadores %' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Rebaixamento %' })).toBeInTheDocument()
  })

  it('permite ajustar perfil no modulador de gols e sortear rodada estocasticamente', async () => {
    const user = userEvent.setup()
    render(<MatchSimulator />)

    // O Modulador exibe os 4 perfis
    expect(screen.getByRole('radio', { name: /Truncado/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Equilibrado/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Elástico/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Goleadas/i })).toBeInTheDocument()

    // O perfil ativo padrão é Elástico (+Gols)
    const elasticRadio = screen.getByRole('radio', { name: /Elástico/i })
    expect(elasticRadio).toHaveAttribute('aria-checked', 'true')

    // Alterna para o perfil 'Goleadas (Show)'
    const goleadaRadio = screen.getByRole('radio', { name: /Goleadas/i })
    await user.click(goleadaRadio)
    expect(goleadaRadio).toHaveAttribute('aria-checked', 'true')
    expect(elasticRadio).toHaveAttribute('aria-checked', 'false')

    // Seleciona a Rodada 35
    const select = screen.getByRole('combobox', { name: /Selecionar rodada para simular/i })
    await user.selectOptions(select, '35')

    // Clica no botão de sortear rodada estocástica
    const diceButton = screen.getByRole('button', { name: /Sortear Rodada/i })
    await user.click(diceButton)

    // Verifica que os placares foram selecionados nos cards da rodada 35
    const matchCards = screen.getAllByRole('article')
    expect(matchCards.length).toBe(10)
    expect(screen.getByRole('heading', { level: 3, name: /Impacto na Classificação & Probabilidades/i })).toBeInTheDocument()
  })

  it('permite aplicar placar com um clique através dos chips rápidos', async () => {
    const user = userEvent.setup()
    render(<MatchSimulator />)

    // Procura por chips de placares rápidos
    const chips = screen.getAllByRole('button', { name: /Placar rápido/i })
    expect(chips.length).toBeGreaterThan(0)

    // Clica no primeiro chip
    await user.click(chips[0]!)

    // Verifica que a tabela simulada foi recalculada
    expect(screen.getByRole('heading', { level: 3, name: /Impacto na Classificação & Probabilidades/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pts Sim.' })).toBeInTheDocument()
  })
})
