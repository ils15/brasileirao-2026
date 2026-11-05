import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectionPanel } from './ProjectionSection'
import { runProjection } from './projection'
import { HISTORICAL_SOURCE } from './historicalSeasons'

const percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('painel de projeções', () => {
  it('apresenta probabilidades por clube, distribuições de pontuação exata e as limitações do modelo', () => {
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'O que ainda pode acontecer' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Projeção concluída')
    const probabilities = screen.getByRole('region', { name: /Probabilidades simuladas por clube/ })
    expect(within(probabilities).getByRole('row', { name: /Flamengo/ })).toBeInTheDocument()
    expect(within(probabilities).getAllByRole('row')).toHaveLength(21)
    expect(screen.getByRole('heading', { name: 'Pontuação exata dado resultado final' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Resultado dado pontuação exata' })).toBeInTheDocument()
    expect(screen.queryByText(/Até 29|30–39|40–49|50–59|60–69|70\+/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/K\/N.*clubes-simulações/).length).toBeGreaterThan(0)
    expect(screen.getByText(/IC 95%.*clusters de simulações/)).toBeInTheDocument()
    const curve = screen.getByRole('region', { name: /Curva de resultado condicionado à pontuação exata/ })
    expect(within(curve).getAllByRole('row').length).toBeGreaterThan(1)
    expect(within(curve).getByRole('row', { name: new RegExp(`^${result.pointCurve.rows[0]!.points} `) })).toHaveTextContent(`${result.pointCurve.rows[0]!.successes}/${result.pointCurve.rows[0]!.denominator}`)
    expect(within(curve).getAllByText('Amostra baixa').length).toBeGreaterThan(0)
    expect(screen.getByText(/Não são odds nem recomendação de apostas/)).toBeInTheDocument()
    expect(screen.getByText(/Em .* jogos futuros não usados no ajuste/)).toBeInTheDocument()
    expect(screen.getByText(/Brier dos grupos finais por posição/)).toBeInTheDocument()
    const backtestSummary = screen.getByText(/Esses Brier medem a política walk-forward/i)
    expect(backtestSummary).toHaveTextContent(new RegExp(`k=${result.featureBacktest.productionShrinkageMatches}.*selecionado para a temporada 2025 usando apenas os anos anteriores.*Não há validação externa independente`, 'i'))
    expect(screen.getByText(/base de treino efetiva.*332 resultados de 2026 até o corte/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(HISTORICAL_SOURCE.sha256))).toBeInTheDocument()
    expect(screen.getByText(/A CBF foi comparada apenas nos totais finais/)).toBeInTheDocument()
    expect(screen.getByText(/resultados H2H concluídos de 2026 nos snapshots disponíveis são acumulados com os resultados simulados/)).toBeInTheDocument()
    expect(screen.getByText(/pontos, saldo e gols marcados no confronto/)).toBeInTheDocument()
    expect(screen.getByText(/o H2H 2026 disponível entra somente no desempate entre dois clubes/)).toBeInTheDocument()
    expect(screen.getByText(/kickoffs anteriores ao corte.*401841304.*401841301/)).toBeInTheDocument()
  })

  it('navega os resultados por teclado e mantém K/N idêntico entre gráfico e tabela', async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    const championTab = screen.getByRole('tab', { name: 'Campeão' })
    championTab.focus()
    await user.keyboard('{ArrowRight}')
    const libertadoresTab = screen.getByRole('tab', { name: 'Libertadores · 2º–5º' })
    expect(libertadoresTab).toHaveAttribute('aria-selected', 'true')
    expect(libertadoresTab).toHaveFocus()

    const distribution = result.pointsAnalysis.distributionByOutcome.find(({ id }) => id === 'libertadores')!
    const tabpanel = screen.getByRole('tabpanel', { name: 'Libertadores · 2º–5º' })
    const chart = within(tabpanel).getByRole('img', { name: /Distribuição discreta de pontos para Libertadores/ })
    expect(chart).toBeInTheDocument()
    expect(within(tabpanel).getByText(`Libertadores · 2º–5º: N = ${distribution.samples.toLocaleString('pt-BR')} clubes-simulações.`)).toBeInTheDocument()

    const exactTable = within(tabpanel).getByRole('region', { name: 'Tabela acessível de pontuação exata por resultado: Libertadores · 2º–5º' })
    const rows = within(exactTable).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(distribution.points.length)
    rows.forEach((row, index) => {
      const point = distribution.points[index]!
      expect(row).toHaveTextContent(String(point.points))
      expect(row).toHaveTextContent(`${point.count.toLocaleString('pt-BR')}/${distribution.samples.toLocaleString('pt-BR')}`)
      expect(chart).toHaveTextContent(`${point.count.toLocaleString('pt-BR')}/${distribution.samples.toLocaleString('pt-BR')}`)
      expect(row).toHaveTextContent(String(point.points))
      expect(row).toHaveTextContent(new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(point.probability))
      expect(chart).toHaveTextContent(`${point.points} pts`)
      expect(chart).toHaveTextContent(new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(point.probability))
    })
  })

  it('exibe mediana, percentis, IC 95%, badge de variação e exporta a tabela de projeções', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:projecoes')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    const probabilities = screen.getByRole('region', { name: /Probabilidades simuladas por clube/ })
    expect(screen.getByText(/n = 8 simulações · IC 95% Wilson/)).toBeInTheDocument()
    expect(within(probabilities).getByRole('columnheader', { name: /MEDIANA DE PONTOS/ })).toBeInTheDocument()
    expect(within(probabilities).getByRole('columnheader', { name: /Δ MEDIANA/ })).toBeInTheDocument()

    const flamengo = result.clubProbabilities.find(({ club }) => club === 'Flamengo')!
    const flamengoRow = within(probabilities).getByRole('row', { name: /Flamengo/ })
    expect(flamengoRow).toHaveTextContent(`IC 95% ${percentFormat.format(flamengo.titleInterval.lower95)}–${percentFormat.format(flamengo.titleInterval.upper95)}`)
    expect(flamengoRow).toHaveTextContent(String(flamengo.pointsStats.median))
    expect(flamengoRow).toHaveTextContent(`${flamengo.pointsStats.p25}–${flamengo.pointsStats.p75}`)
    expect(flamengoRow).toHaveTextContent(`atual ${flamengo.currentPoints}`)
    // Badge de variação: valor absoluto + percentual em todas as linhas
    expect(within(probabilities).getAllByText(/ pts \(/)).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'CSV' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect((click.mock.instances.at(-1) as HTMLAnchorElement).download).toContain('brasileirao-2026-projecoes')

    // Ordenação por título troca o estado do cabeçalho
    const titleHeaderButton = within(probabilities).getByRole('button', { name: /^TÍTULO/ })
    await user.click(titleHeaderButton)
    expect(within(probabilities).getByRole('columnheader', { name: /^TÍTULO/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(titleHeaderButton)
    expect(within(probabilities).getByRole('columnheader', { name: /^TÍTULO/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('apresenta os quatro modelos de ablação em cada dobra temporal sem sugerir ganho consistente', () => {
    render(<ProjectionPanel result={runProjection({ simulations: 8, seed: 123 })} status="ready" onRetry={vi.fn()} />)

    const ablation = screen.getByRole('region', { name: /Ablação temporal de recursos/ })
    expect(within(ablation).getByRole('columnheader', { name: /BASELINE/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('columnheader', { name: /BRIER CASA\/FORA/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('columnheader', { name: /BRIER H2H/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('columnheader', { name: /BRIER COMBINADO/ })).toBeInTheDocument()
    expect(within(ablation).getByRole('row', { name: /2023/ })).toHaveTextContent('0,653')
    expect(screen.getByText(/H2H é apenas contexto e tem peso zero na projeção/)).toBeInTheDocument()
    expect(screen.getByText(/não mostram melhoria consistente/)).toBeInTheDocument()
  })

  it('informa quando as simulações ainda estão em processamento', () => {
    render(<ProjectionPanel result={null} status="loading" onRetry={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Calculando cenários em segundo plano')
  })

  it.each(['loading', 'error'] as const)('mantém destinos de navegação disponíveis no estado %s', (status) => {
    render(<ProjectionPanel result={null} status={status} onRetry={vi.fn()} />)

    expect(document.getElementById('probabilidades-time')).toHaveTextContent(/Probabilidades por time/)
    expect(document.getElementById('por-pontuacao')).toHaveTextContent(/Probabilidade por pontuação/)
    expect(document.getElementById('estatisticas')).toHaveTextContent(/Estatísticas e metodologia/)
    expect(screen.getByRole('heading', { name: 'Probabilidades por time' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Probabilidade por pontuação' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Estatísticas e metodologia' })).toBeInTheDocument()
    expect(screen.getByRole(status === 'loading' ? 'status' : 'alert')).toBeInTheDocument()
  })
})
