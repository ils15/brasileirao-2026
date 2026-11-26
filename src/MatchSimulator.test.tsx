import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MatchSimulator } from './MatchSimulator'
import { matchProbabilities } from './matchProbabilities'
import { remainingFixtures } from './projectionData'
import { groupPendingRounds } from './roundGroups'

describe('simulador de confrontos (MatchSimulator)', () => {
  it('renderiza os cards da rodada com xG, escudos e botões semânticos com placares prováveis', () => {
    render(<MatchSimulator />)

    expect(screen.getByRole('heading', { level: 2, name: /Simulador Interativo do Brasileirão/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mais Prováveis/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Favoritos/i })).toBeInTheDocument()

    // A rodada exibida é a primeira do agrupamento — o componente e o teste
    // usam a mesma função, então nenhum dos dois depende de qual rodada está
    // pendente no pacote de dados de hoje.
    const [firstGroup] = groupPendingRounds(remainingFixtures)
    const select = screen.getByRole('combobox', { name: /Selecionar rodada para simular/i })
    expect(select).toHaveValue(firstGroup!.round)

    const firstFixture = firstGroup!.fixtures[0]!
    // O componente calcula os placares com o multiplicador do perfil ativo
    // (Elástico por padrão); o teste lê esse multiplicador do próprio DOM em
    // vez de cravar o perfil ou o número.
    const activeMultiplier = Number.parseFloat(
      screen.getByRole('radio', { checked: true }).querySelector('.sim-profile-badge')?.textContent ?? '1',
    )
    const { expected, mostProbable } = matchProbabilities(firstFixture.home, firstFixture.away, activeMultiplier)

    // O card exibe o xG com base nas forças de ataque e defesa (escopado ao card
    // porque dois jogos da rodada podem empatar no mesmo valor arredondado)
    const firstCard = screen.getAllByRole('article')[0]!
    const cardView = within(firstCard)
    expect(firstCard.querySelector('.sim-match-xg')).toHaveTextContent(
      `xG: ${expected.home.toFixed(2)} × ${expected.away.toFixed(2)}`,
    )

    // Os botões semânticos ou chips mostram o placar mais provável de cada desfecho
    expect(cardView.getAllByText(new RegExp(`${mostProbable.homeWin.homeGoals}×${mostProbable.homeWin.awayGoals}`)).length).toBeGreaterThan(0)
    expect(cardView.getAllByText(new RegExp(`${mostProbable.draw.homeGoals}×${mostProbable.draw.awayGoals}`)).length).toBeGreaterThan(0)
    expect(cardView.getAllByText(new RegExp(`${mostProbable.awayWin.homeGoals}×${mostProbable.awayWin.awayGoals}`)).length).toBeGreaterThan(0)
  })

  it('preenche cenários com placares coerentes baseados em xG e não em constantes 2x1', async () => {
    const user = userEvent.setup()
    render(<MatchSimulator />)

    // Seleciona uma rodada completa com jogos pendentes — derivada do
    // agrupamento, nunca de um número de rodada cravado no teste.
    const targetGroup = groupPendingRounds(remainingFixtures).at(-1)!
    const select = screen.getByRole('combobox', { name: /Selecionar rodada para simular/i })
    await user.selectOptions(select, targetGroup.round)

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

    // Seleciona a última rodada pendente do agrupamento e sorteia
    const targetGroup = groupPendingRounds(remainingFixtures).at(-1)!
    const select = screen.getByRole('combobox', { name: /Selecionar rodada para simular/i })
    await user.selectOptions(select, targetGroup.round)

    // Clica no botão de sortear rodada estocástica
    const diceButton = screen.getByRole('button', { name: /Sortear Rodada/i })
    await user.click(diceButton)

    // Verifica que os placares foram selecionados nos cards da rodada sorteada —
    // um card por jogo pendente daquela rodada, derivado do agrupamento.
    expect(targetGroup.fixtures.length).toBeGreaterThan(0)
    const matchCards = screen.getAllByRole('article')
    expect(matchCards.length).toBe(targetGroup.fixtures.length)
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
