import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MethodologyPanel } from './MethodologyPanel'
import { estimateExpectedGoals, runProjection } from './projection'
import { HISTORICAL_SOURCE } from './historicalSeasons'
import { currentClubs, remainingFixtures } from './projectionData'
import { expectedGoalsBreakdown } from './matchModel'
import { productionTrainingMatches } from './modelBacktest'

describe('aba metodologia & validação', () => {
  it('apresenta backtest, ablação e as limitações do modelo', { timeout: 30_000 }, () => {
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<MethodologyPanel result={result} status="ready" onRetry={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Metodologia & Validação' })).toBeInTheDocument()
    expect(screen.getByText(/Em .* jogos futuros não usados no ajuste/)).toBeInTheDocument()
    expect(screen.getByText(/Brier dos grupos finais por posição/)).toBeInTheDocument()
    const backtestSummary = screen.getByText(/Esses Brier medem a política walk-forward/i)
    expect(backtestSummary).toHaveTextContent(new RegExp(`k=${result.featureBacktest.productionShrinkageMatches}.*selecionado para a temporada 2025 usando apenas os anos anteriores.*Não há validação externa independente`, 'i'))
    expect(screen.getByText(/base de treino efetiva/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(HISTORICAL_SOURCE.sha256))).toBeInTheDocument()
    expect(screen.getByText(/A validação agregada contra tabelas finais CBF cobre 2021–2025/)).toBeInTheDocument()
    const officialRule = screen.getByText('Norma oficial:').closest('p')!
    expect(officialRule).toHaveTextContent(/pontos.*vitórias.*saldo.*gols pró.*confronto direto.*menos cartões vermelhos.*menos cartões amarelos.*sorteio/i)
    expect(officialRule).toHaveTextContent(/confronto direto entre dois clubes.*pontos.*saldo.*para três ou mais clubes, o confronto direto não se aplica/i)
    const implementedComparator = screen.getByText('Comparador analítico implementado:').closest('p')!
    expect(implementedComparator).toHaveTextContent(/dois clubes.*pontos.*saldo.*gols pró.*sorteio antes dos cartões.*três ou mais clubes.*disciplina estimada/i)
    expect(implementedComparator).toHaveTextContent(/cartões reais disponíveis no snapshot 365scores.*cartões projetados pela taxa por jogo, não simulados partida a partida/i)
    expect(implementedComparator).toHaveTextContent(/não reproduz integralmente o Art\. 15 nem certifica uma classificação oficial/i)
    const temporalLimit = screen.getByText('Limite temporal:').closest('p')!
    expect(temporalLimit).toHaveTextContent(/snapshot 365scores.*após o corte analítico 2026-11-07T00:58:14\.422Z.*não tem cobertura temporal por partida suficiente.*não certificam o desempate oficial no corte/i)
  })

  it('apresenta os quatro modelos de ablação em cada dobra temporal sem sugerir ganho consistente', () => {
    render(<MethodologyPanel result={runProjection({ simulations: 8, seed: 123 })} status="ready" onRetry={vi.fn()} />)

    const ablation = screen.getByRole('region', { name: /Ablação temporal de recursos/ })
    expect(within(ablation).getByRole('columnheader', { name: /BASELINE/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('columnheader', { name: /BRIER CASA\/FORA/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('columnheader', { name: /BRIER H2H/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('columnheader', { name: /BRIER COMBINADO/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('row', { name: /2023/ })).toHaveTextContent('0,616')
    expect(screen.getByText(/H2H é apenas contexto e tem peso zero na projeção/)).toBeInTheDocument()
    expect(screen.getByText(/não mostram melhoria consistente/)).toBeInTheDocument()
  })

  it('exibe a tabela de forças por clube e mando com as 20 linhas', () => {
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<MethodologyPanel result={result} status="ready" onRetry={vi.fn()} />)
    const table = screen.getByRole('region', { name: 'Forças de ataque e defesa por clube e mando' })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(20)
    expect(screen.getByText(/média da liga na base de treino/i)).toBeInTheDocument()
  })

  it('exibe o bloco do blend xG × gols com os pesos candidatos e o peso de produção', { timeout: 30_000 }, () => {
    render(<MethodologyPanel result={runProjection({ simulations: 8, seed: 123 })} status="ready" onRetry={vi.fn()} />)

    const region = screen.getByRole('region', { name: /Brier do blend xG por peso/ })
    expect(within(region).getByRole('columnheader', { name: /PESO DO xG/ })).toBeInTheDocument()
    expect(within(region).getByRole('columnheader', { name: /BRIER ACUMULADO/ })).toBeInTheDocument()
    // Modelos puros delimitam a tabela; o melhor peso medido aparece marcado
    expect(within(region).getByRole('row', { name: /só gols/ })).toBeInTheDocument()
    expect(within(region).getByRole('row', { name: /só xG/ })).toBeInTheDocument()
    expect(within(region).getAllByRole('row', { name: /melhor/ }).length).toBe(1)
    // Produção declara o peso fixado (w = 0,15 adotado no corte nov/2026)
    expect(screen.getByText(/Produção usa w = 0,150/)).toBeInTheDocument()
    expect(screen.getByText(/snapshot 365scores capturado em 2026-11-07T15:25:20\.960Z, após o corte analítico, sem timestamp temporal por partida.*t−1 descreve apenas a separação das rodadas.*não comprova/)).toBeInTheDocument()
  })

  it('o exemplo numérico do λ é rastreável e bate com o λ de produção (blend incluído)', () => {
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<MethodologyPanel result={result} status="ready" onRetry={vi.fn()} />)

    const fixture = remainingFixtures[0]!
    const homeName = currentClubs.find(({ id }) => id === fixture.home)!.club
    const awayName = currentClubs.find(({ id }) => id === fixture.away)!.club
    expect(screen.getByRole('heading', { name: new RegExp(`De onde vem o λ de ${homeName} × ${awayName}`) })).toBeInTheDocument()

    // O λ exibido no exemplo é o mesmo caminho da produção
    const breakdown = expectedGoalsBreakdown(fixture.home, fixture.away, productionTrainingMatches, 2026, result.featureBacktest.productionShrinkageMatches)
    const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    const steps = screen.getByText(/Decomposição em gols:/).closest('li')!
    expect(steps).toHaveTextContent(`= ${decimal.format(breakdown.expected.home)}`)
    // Blend ativo: o exemplo mostra o λ final de produção (gols + xG)
    const blendStep = screen.getByText(/Blend com xG:/).closest('li')!
    expect(blendStep).toHaveTextContent(`= ${decimal.format(estimateExpectedGoals(fixture.home, fixture.away).home)}`)
  })

  it('mantém o destino #estatisticas disponível nos estados loading e error', () => {
    const { rerender } = render(<MethodologyPanel result={null} status="loading" onRetry={vi.fn()} />)
    expect(document.getElementById('estatisticas')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Calculando validação')

    rerender(<MethodologyPanel result={null} status="error" onRetry={vi.fn()} />)
    expect(document.getElementById('estatisticas')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível executar as simulações')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  })
})
