import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectionPanel } from './ProjectionSection'
import { runProjection } from './projection'

const percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('painel de projeções', () => {
  // O primeiro teste do arquivo paga o cold start dos backtests cacheados
  // (5 temporadas × 5.000 simulações); runners de CI mais lentos passam de 5s.
  it('apresenta probabilidades por clube, distribuições de pontuação exata e as limitações do modelo', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'O que ainda pode acontecer' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Projeção concluída')
    // Guia de leitura e duas tabelas com perguntas claras
    expect(screen.getByText(/Em que zona o clube pode terminar\?/)).toBeInTheDocument()
    expect(screen.getByText(/Quantos pontos o clube deve fazer\?/)).toBeInTheDocument()
    const zones = screen.getByRole('region', { name: /Zonas possíveis por clube/ })
    expect(within(zones).getByRole('row', { name: /Flamengo/ })).toBeInTheDocument()
    expect(within(zones).getAllByRole('row')).toHaveLength(21)
    // Barra empilhada de 5 zonas por linha
    expect(within(zones).getAllByRole('img', { name: /Cenários de/ })).toHaveLength(20)
    const pointsTable = screen.getByRole('region', { name: /Pontos finais projetados por clube/ })
    expect(within(pointsTable).getAllByRole('row')).toHaveLength(21)
    expect(screen.getByText(/Não são odds nem recomendação de apostas/)).toBeInTheDocument()
    // Sub-abas: Por clube ativa; Por pontuação montado mas oculto
    expect(screen.getByRole('tab', { name: 'Por clube' })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('analise-por-pontuacao')!.hidden).toBe(true)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))
    expect(document.getElementById('analise-por-pontuacao')!.hidden).toBe(false)
    expect(document.getElementById('analise-por-clube')!.hidden).toBe(true)
    // Gráfico discreto de pontuação exata foi removido; o painel mágico é a única leitura por pontuação
    expect(screen.queryByText(/Pontuação exata dado resultado final/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Gráfico discreto/)).not.toBeInTheDocument()

    // Pontuação mágica: linhas do destino + tabela de rebaixamento por pontuação
    expect(screen.getByRole('heading', { name: /A pontuação mágica: quantos pontos bastam\?/ })).toBeInTheDocument()
    expect(screen.getByText(/Salvo é o mais provável/)).toBeInTheDocument()
    expect(screen.getByText(/Salvo na prática/)).toBeInTheDocument()
    expect(screen.getByText(/Rebaixado praticamente garantido/)).toBeInTheDocument()
    // Seletor de destino: trocar para Título muda os KPIs
    expect(screen.getByRole('group', { name: 'Destino para a pontuação mágica' })).toBeInTheDocument()
    const magicTable = screen.getByRole('region', { name: /Chance de rebaixamento por pontuação exata/ })
    // Barras só onde 0% < chance < 100%; faixas estáveis ficam sem barra
    const bars = within(magicTable).getAllByRole('img', { name: /chance de rebaixamento/ })
    expect(bars.length).toBeGreaterThanOrEqual(2)
    // A tabela exibe SOMENTE a estatística do destino selecionado
    expect(within(magicTable).getByRole('columnheader', { name: /Chance de rebaixamento/ })).toBeInTheDocument()
    expect(within(magicTable).queryByRole('columnheader', { name: /^Título/ })).not.toBeInTheDocument()
    // Primeira faixa: 100% de chance e SEM barra (valor estável)
    const firstDataRow = within(magicTable).getAllByRole('row')[1]!
    expect(firstDataRow).toHaveTextContent('100,0%')
    expect(firstDataRow.querySelector('.magic-bar')).toBeNull()
    expect(firstDataRow.querySelector('.magic-bar')).toBeNull()
  })

  it('exibe mediana, percentis, IC 95%, badge de variação e exporta a tabela de projeções', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:projecoes')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    const zones = screen.getByRole('region', { name: /Zonas possíveis por clube/ })
    const points = screen.getByRole('region', { name: /Pontos finais projetados por clube/ })
    expect(screen.getByText(/n = 8 simulações · IC 95% Wilson/)).toBeInTheDocument()
    expect(within(points).getByRole('columnheader', { name: /^Mediana/ })).toBeInTheDocument()
    expect(within(points).getByRole('columnheader', { name: /Δ vs hoje/ })).toBeInTheDocument()

    // Clube com chance intermediária exibe IC; chance 0%/100% não exibe intervalo
    // Chance estritamente entre 0 e 1 é o caso em que o IC é exibido (rebaixamento sempre tem intermediários)
    const withInterval = result.clubProbabilities.find((club) => club.relegation > 0 && club.relegation < 1)!
    const withIntervalRow = within(zones).getByRole('row', { name: new RegExp(withInterval.club) })
    expect(withIntervalRow.textContent).toContain(`IC ${percentFormat.format(withInterval.relegationInterval.lower95)}–${percentFormat.format(withInterval.relegationInterval.upper95)}`)
    const certainClub = result.clubProbabilities.find((club) => club.title === 0 || club.title === 1)
    if (certainClub) {
      const certainRow = within(zones).getByRole('row', { name: new RegExp(certainClub.club) })
      expect(certainRow.querySelector('.probability-cell--zero')).not.toBeNull()
    }
    expect(within(zones).getByRole('img', { name: /Cenários de Flamengo/ })).toBeInTheDocument()

    const flamengo = result.clubProbabilities.find(({ club }) => club === 'Flamengo')!
    const flamengoPointsRow = within(points).getByRole('row', { name: /Flamengo/ })
    expect(flamengoPointsRow).toHaveTextContent(String(flamengo.pointsStats.median))
    expect(flamengoPointsRow).toHaveTextContent(`${flamengo.pointsStats.p25}–${flamengo.pointsStats.p75}`)
    expect(flamengoPointsRow).toHaveTextContent(String(flamengo.currentPoints))
    // Badge de variação: valor absoluto + percentual em todas as linhas
    expect(within(points).getAllByText(/ pts \(/)).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'CSV' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect((click.mock.instances.at(-1) as HTMLAnchorElement).download).toContain('brasileirao-2026-projecoes')

    // Ordenação por título troca o estado do cabeçalho
    const titleHeaderButton = within(zones).getByRole('button', { name: /^Título/ })
    await user.click(titleHeaderButton)
    expect(within(zones).getByRole('columnheader', { name: /^Título/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(titleHeaderButton)
    expect(within(zones).getByRole('columnheader', { name: /^Título/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('informa quando as simulações ainda estão em processamento', () => {
    render(<ProjectionPanel result={null} status="loading" onRetry={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Calculando cenários em segundo plano')
  })

  it.each(['loading', 'error'] as const)('mantém destinos de navegação disponíveis no estado %s', (status) => {
    render(<ProjectionPanel result={null} status={status} onRetry={vi.fn()} />)

    expect(document.getElementById('probabilidades-time')).toHaveTextContent(/Probabilidades por time/)
    expect(document.getElementById('por-pontuacao')).toHaveTextContent(/Probabilidade por pontuação/)
    expect(screen.getByRole('heading', { name: 'Probabilidades por time' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Probabilidade por pontuação' })).toBeInTheDocument()
    expect(screen.getByRole(status === 'loading' ? 'status' : 'alert')).toBeInTheDocument()
  })
})
