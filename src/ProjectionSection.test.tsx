import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectionPanel } from './ProjectionSection'
import { runProjection } from './projection'

const percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
    expect(screen.getByText('G-6*:').closest('p')).toHaveTextContent(/cenário adotado neste painel.*não é conclusão automática apenas porque o Palmeiras chegou à final/i)
    const regulationNote = screen.getByText('Regulamento:').closest('p')!
    expect(regulationNote).toHaveTextContent(/Art\. 7.*seis clubes seguintes que não estejam na Libertadores \(7º–12º neste cenário\)/i)
    expect(regulationNote).toHaveTextContent(/redistribuição depende das regras aplicáveis e da sobreposição de classificados/i)
    expect(screen.getByText(/Posições 7–12: seis melhores não classificados à Libertadores/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'REC CBF 2026 (Art. 7)' }).getAttribute('href')).toContain('REC_Brasileiro_SA_rie_A_2026')
    const zones = screen.getByRole('region', { name: /Zonas possíveis por clube/ })
    expect(within(zones).getByRole('row', { name: /Flamengo/ })).toBeInTheDocument()
    expect(within(zones).getAllByRole('row')).toHaveLength(21)
    // Barra empilhada de 5 zonas por linha
    expect(within(zones).getAllByRole('img', { name: /Cenários de/ })).toHaveLength(20)
    const firstClubBar = within(zones).getByRole('img', { name: /Cenários de Flamengo/ })
    expect(firstClubBar).toHaveAccessibleName(/Campeão .*Libertadores 2º–6º/)
    const barLegend = screen.getByRole('group', { name: 'Legenda das barras de zonas' })
    expect(within(barLegend).getByText('Libertadores 2º–6º')).toBeVisible()
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
    expect(screen.getByText(/Sem Série B é o mais provável/)).toBeInTheDocument()
    expect(screen.getByText(/Sem Série B praticamente garantido/)).toBeInTheDocument()
    expect(screen.getByText(/rebaixado para a Série B praticamente garantido/i)).toBeInTheDocument()
    // Seletor de destino: trocar para Título muda os KPIs
    expect(screen.getByRole('group', { name: 'Destino para a pontuação mágica' })).toBeInTheDocument()
    const magicTable = screen.getByRole('region', { name: /Chance de ser rebaixado para a Série B por pontuação exata/ })
    // Toda linha tem barra, inclusive nos extremos; o texto do valor e do IC
    // aparece só quando muda em relação à linha anterior.
    const dataRows = within(magicTable).getAllByRole('row').slice(1)
    expect(dataRows.length).toBeGreaterThan(0)
    for (const row of dataRows) {
      expect(row.querySelector('.magic-bar')).not.toBeNull()
    }
    // Sem selos por linha: valores saturados repetidos são omitidos, mas a
    // barra e o rótulo acessível continuam em todas as linhas.
    expect(within(magicTable).queryAllByText('impossível')).toHaveLength(0)
    expect(within(magicTable).queryAllByText('Rebaixado para a Série B')).toHaveLength(0)
    // A tabela exibe SOMENTE a estatística do destino selecionado
    expect(within(magicTable).getByRole('columnheader', { name: /Chance de ser rebaixado para a Série B/ })).toBeInTheDocument()
    expect(within(magicTable).queryByRole('columnheader', { name: /^Título/ })).not.toBeInTheDocument()
  })

  it('não repete percentual e IC consecutivos idênticos, mantendo barra e valor acessível por linha', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))

    const valueOf = (row: HTMLElement): HTMLElement => row.querySelector<HTMLElement>('td.games-cell')!

    // Rebaixamento: bloco inicial de 100,00% — o texto aparece só na primeira linha.
    const relegationTable = screen.getByRole('region', { name: /Chance de ser rebaixado para a Série B por pontuação exata/ })
    const relegationRows = within(relegationTable).getAllByRole('row').slice(1)
    expect(relegationRows.filter((row) => valueOf(row).textContent === '100,00%')).toHaveLength(1)
    // O rótulo fica na primeira linha do bloco de 100%.
    expect(relegationRows.findIndex((row) => valueOf(row).textContent === '100,00%')).toBe(0)
    const suppressedCertain = relegationRows.filter((row) => valueOf(row).textContent === '' && /Com .+ pontos: 100,00% de rebaixado/.test(row.querySelector('.magic-bar')!.getAttribute('aria-label')!))
    expect(suppressedCertain.length).toBeGreaterThan(0)
    for (const row of suppressedCertain) {
      // A barra continua em toda linha e carrega o valor no nome acessível.
      expect(row.querySelector('.magic-bar')).toHaveAccessibleName(/100,00% de rebaixado para a Série B/)
    }
    // Valores que mudam continuam visíveis.
    expect(within(relegationTable).getByText('28,57%')).toBeVisible()
    expect(within(relegationTable).getByText('33,33%')).toBeVisible()
    expect(within(relegationTable).getByText('22,22%')).toBeVisible()

    // Libertadores: pontos sem nenhum sucesso no destino mostram "0 de N observações".
    await user.click(within(screen.getByRole('group', { name: 'Destino para a pontuação mágica' })).getByRole('button', { name: 'Libertadores' }))
    const libertadoresTable = screen.getByRole('region', { name: /Chance de ser classificado para a Libertadores por pontuação exata/ })
    const libertadoresRows = within(libertadoresTable).getAllByRole('row').slice(1)
    const zeroObservationRows = libertadoresRows.filter((row) => /^0 de [\d.]+ observações$/.test(valueOf(row).textContent ?? ''))
    expect(zeroObservationRows.length).toBeGreaterThan(0)
    for (const row of zeroObservationRows) {
      expect(row.querySelector('.cell-ci')).toBeNull()
      expect(row.querySelector('.magic-bar--empty')).not.toBeNull()
      expect(row.querySelector('.magic-bar')).toHaveAccessibleName(/^Com .+ pontos: nenhuma observação de classificação para a Libertadores em [\d.]+ simulações desta pontuação$/)
    }
    expect(libertadoresRows.filter((row) => valueOf(row).textContent === '100,00%')).toHaveLength(1)
    // IC 95% idêntico ao da linha anterior também não se repete.
    const visibleIntervals = libertadoresRows
      .map((row) => row.querySelector('.cell-ci')?.textContent)
      .filter((text): text is string => Boolean(text))
    expect(visibleIntervals.length).toBeGreaterThan(1)
    for (let index = 1; index < visibleIntervals.length; index += 1) {
      expect(visibleIntervals[index]).not.toBe(visibleIntervals[index - 1])
    }
    for (const row of libertadoresRows) {
      expect(row.querySelector('.magic-bar')).not.toBeNull()
    }
    // Repetição consecutiva: texto visível suprimido, valor preservado na barra.
    const suppressedRepeat = libertadoresRows.find((row) => valueOf(row).textContent === '')
    expect(suppressedRepeat!.querySelector('.magic-bar')).toHaveAccessibleName(/^Com .+ pontos: \d{1,3},\d{2}% de classificado para a Libertadores; IC 95% /)
  })

  it('expõe o resumo completo só no nome acessível da barra, sem duplicar o texto visível', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))

    const table = screen.getByRole('region', { name: /Chance de ser rebaixado para a Série B por pontuação exata/ })
    const rows = within(table).getAllByRole('row').slice(1)
    const valueOf = (row: HTMLElement): HTMLElement => row.querySelector<HTMLElement>('td.games-cell')!

    // Toda linha tem um único nome completo na barra; o texto visível é decorativo.
    for (const row of rows) {
      const bar = within(row).getByRole('img')
      const withoutObservations = /^0 de [\d.]+ observações$/.test(valueOf(row).textContent ?? '')
      if (withoutObservations) {
        expect(bar).toHaveAccessibleName(/^Com .+ pontos: nenhuma observação de rebaixamento em [\d.]+ simulações desta pontuação$/)
        expect(row.querySelector('.cell-ci')).toBeNull()
        expect(row.querySelector('.magic-bar--empty')).not.toBeNull()
      } else {
        expect(bar).toHaveAccessibleName(/^Com .+ pontos: \d{1,3},\d{2}% de rebaixado para a Série B; IC 95% /)
        const visibleChance = valueOf(row).querySelector('span')
        if (valueOf(row).textContent !== '') {
          expect(visibleChance).toHaveAttribute('aria-hidden', 'true')
        }
      }
      for (const interval of row.querySelectorAll('.cell-ci')) {
        expect(interval).toHaveAttribute('aria-hidden', 'true')
      }
    }

    // Linha visível: valor e IC aparecem no td, mas só a barra os anuncia.
    const visibleRow = rows.find((row) => row.querySelector('.cell-ci'))!
    expect(visibleRow.querySelector('.cell-ci')).toHaveTextContent(/^IC 95% /)
    expect(within(visibleRow).getByRole('img')).toHaveAccessibleName(/IC 95% /)
    expect(valueOf(visibleRow)).not.toHaveAttribute('title')

    // Linha suprimida: td vazio para o leitor (sem `title` duplicando o valor),
    // mas a barra segue com valor e intervalo.
    const suppressedRow = rows.find((row) => valueOf(row).textContent === '')!
    expect(valueOf(suppressedRow)).not.toHaveAttribute('title')
    expect(suppressedRow.querySelector('.magic-bar')).toHaveAccessibleName(/100,00% de rebaixado para a Série B; IC 95% /)
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
    const flamengoCells = flamengoPointsRow.querySelectorAll('th, td')
    expect(flamengoCells[4]).toHaveTextContent(String(flamengo.pointsStats.p25))
    expect(flamengoCells[5]).toHaveTextContent(String(flamengo.pointsStats.p75))
    expect(flamengoPointsRow).toHaveTextContent(String(flamengo.currentPoints))
    // Badge de variação: valor absoluto + percentual em todas as linhas
    expect(within(points).getAllByText(/ pts \(/)).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'CSV' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect((click.mock.instances.at(-1) as HTMLAnchorElement).download).toContain('brasileirao-2026-projecoes')

    // Ordenação por título troca o estado do cabeçalho
    const titleHeaderButton = within(zones).getByRole('button', { name: /^Título/ })
    await user.click(titleHeaderButton)
    expect(within(zones).getByRole('columnheader', { name: /^Título/ })).toHaveAttribute('aria-sort', 'descending')
    await user.click(titleHeaderButton)
    expect(within(zones).getByRole('columnheader', { name: /^Título/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('alinha cada valor projetado com seu cabeçalho sem descartar pontos presentes', { timeout: 30_000 }, () => {
    const result = runProjection({ simulations: 8, seed: 123 })
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    const points = screen.getByRole('region', { name: /Pontos finais projetados por clube/ })
    const headerCount = within(points).getAllByRole('columnheader').length
    const rows = within(points).getAllByRole('row').slice(1)
    expect(headerCount).toBe(8)
    expect(rows).toHaveLength(result.clubProbabilities.length)

    for (const club of result.clubProbabilities) {
      const row = within(points).getByRole('row', { name: new RegExp(club.club) })
      const cells = [...row.querySelectorAll('th, td')]
      expect(cells).toHaveLength(headerCount)
      expect(cells[0]).toHaveTextContent(String(club.currentPosition).padStart(2, '0'))
      expect(cells[1]).toHaveTextContent(club.club)
      expect(cells[2]).toHaveTextContent(String(club.currentPoints))
      expect(cells[3]).toHaveTextContent(String(club.pointsStats.median))
      expect(cells[4]).toHaveTextContent(String(club.pointsStats.p25))
      expect(cells[5]).toHaveTextContent(String(club.pointsStats.p75))
      expect(cells[6]).toHaveTextContent(String(club.pointsStats.p90))
      expect(cells[7]).toHaveTextContent(/pts \(/)
      expect(cells.every((cell) => cell.textContent?.trim())).toBe(true)
    }
  })

  it('exibe Sul-Americana como probabilidade exclusiva de 7º–12º com IC do mesmo conjunto', async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    result.simulations = 100
    result.pointCurve = {
      simulationCount: 100,
      inclusiveLibertadores: [],
      rows: [
        { points: 50, outcome: 'title', successes: 10, denominator: 100, probability: 0.1, lower95: 0.08, upper95: 0.12, clusterCount: 100, lowSample: false },
        { points: 50, outcome: 'libertadores', successes: 20, denominator: 100, probability: 0.2, lower95: 0.16, upper95: 0.24, clusterCount: 100, lowSample: false },
        { points: 50, outcome: 'sudamericana', successes: 60, denominator: 100, probability: 0.6, lower95: 0.56, upper95: 0.64, clusterCount: 100, lowSample: false },
        { points: 50, outcome: 'middle', successes: 0, denominator: 100, probability: 0, lower95: 0, upper95: 0, clusterCount: 100, lowSample: false },
        { points: 50, outcome: 'relegation', successes: 10, denominator: 100, probability: 0.1, lower95: 0.06, upper95: 0.14, clusterCount: 100, lowSample: false },
      ],
    }
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))
    await user.click(screen.getByRole('button', { name: 'Sul-Americana' }))

    const table = screen.getByRole('region', { name: /Chance de ser classificado para a Sul-Americana/ })
    const row = within(table).getByRole('row', { name: /50/ })
    expect(row).toHaveTextContent('60,00%')
    expect(row).toHaveTextContent('IC 95% 56,00%–64,00%')
    expect(screen.getByText(/Faixa Sul-Americana \(7º–12º: 60,00%\)/)).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.classList.contains('magic-chart-caption') ?? false)).toHaveTextContent(/Sul-Americana.*7º–12º/)
  })

  it('usa para Libertadores inclusiva o IC cluster-robusto agregado por simulação', async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    const probability = 3 / 8
    const upper95 = probability + 1.96 * Math.sqrt(11 / 192)
    result.pointCurve = {
      simulationCount: 4,
      inclusiveLibertadores: [{
        points: 50, successes: 3, denominator: 8, probability, lower95: 0, upper95,
        clusterCount: 4, lowSample: true,
      }],
      rows: [
        { points: 50, outcome: 'title', successes: 1, denominator: 8, probability: 1 / 8, lower95: 0.02, upper95: 0.3, clusterCount: 4, lowSample: true },
        { points: 50, outcome: 'libertadores', successes: 2, denominator: 8, probability: 2 / 8, lower95: 0.1, upper95: 0.4, clusterCount: 4, lowSample: true },
        { points: 50, outcome: 'sudamericana', successes: 3, denominator: 8, probability: 3 / 8, lower95: 0.1, upper95: 0.6, clusterCount: 4, lowSample: true },
        { points: 50, outcome: 'middle', successes: 1, denominator: 8, probability: 1 / 8, lower95: 0.02, upper95: 0.3, clusterCount: 4, lowSample: true },
        { points: 50, outcome: 'relegation', successes: 1, denominator: 8, probability: 1 / 8, lower95: 0.02, upper95: 0.3, clusterCount: 4, lowSample: true },
      ],
    }
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))
    await user.click(screen.getByRole('button', { name: 'Libertadores' }))

    const table = screen.getByRole('region', { name: /Chance de ser classificado para a Libertadores por pontuação exata/ })
    const row = within(table).getByRole('row', { name: /50/ })
    expect(row).toHaveTextContent('37,50%')
    expect(row).toHaveTextContent(`IC 95% ${percentFormat.format(0)}–${percentFormat.format(upper95)}`)
    expect(row).toHaveTextContent('amostra baixa')
  })

  it('mostra “0 de N observações” quando não houve sucesso do destino e mantém percentual e IC nas linhas observadas', async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    result.pointCurve = {
      simulationCount: 100,
      inclusiveLibertadores: [
        // build() agrega o ponto sempre que há simulações, mesmo com zero
        // sucessos inclusivos: 100 observações, nenhuma vaga na Libertadores.
        { points: 50, successes: 0, denominator: 100, probability: 0, lower95: 0, upper95: 0.037, clusterCount: 100, lowSample: false },
        { points: 51, successes: 30, denominator: 100, probability: 0.3, lower95: 0.22, upper95: 0.39, clusterCount: 100, lowSample: false },
      ],
      rows: [
        // Ponto 50 tem 100 observações, mas nenhuma de título: build() não
        // emite linha de destino com zero sucessos.
        { points: 50, outcome: 'sudamericana', successes: 100, denominator: 100, probability: 1, lower95: 0.97, upper95: 1, clusterCount: 100, lowSample: false },
        { points: 51, outcome: 'title', successes: 30, denominator: 100, probability: 0.3, lower95: 0.22, upper95: 0.39, clusterCount: 100, lowSample: false },
        { points: 52, outcome: 'title', successes: 100, denominator: 100, probability: 1, lower95: 0.97, upper95: 1, clusterCount: 100, lowSample: false },
      ],
    }
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))
    await user.click(screen.getByRole('button', { name: 'Campeão' }))

    const titleTable = screen.getByRole('region', { name: /Chance de ser campeão por pontuação exata/ })
    const titleRows = within(titleTable).getAllByRole('row').slice(1)
    const rowFor = (points: string): HTMLElement => titleRows.find((row) => row.querySelector('th')?.textContent === points)!

    const withoutObservations = rowFor('50')
    expect(withoutObservations).toHaveTextContent('0 de 100 observações')
    expect(withoutObservations).not.toHaveTextContent('0,00%')
    expect(withoutObservations.querySelector('.cell-ci')).toBeNull()
    expect(withoutObservations.querySelector('.magic-bar-fill')).toBeNull()
    expect(withoutObservations.querySelector('.magic-bar--empty')).not.toBeNull()
    expect(within(withoutObservations).getByRole('img'))
      .toHaveAccessibleName('Com 50 pontos: nenhuma observação de título em 100 simulações desta pontuação')

    // Primeira linha com observação depois do bloco vazio volta a exibir valor.
    const observed = rowFor('51')
    expect(observed).toHaveTextContent('30,00%')
    expect(observed).toHaveTextContent(`IC 95% ${percentFormat.format(0.22)}–${percentFormat.format(0.39)}`)
    expect(observed.querySelector('.magic-bar-fill')).not.toBeNull()

    const full = rowFor('52')
    expect(full).toHaveTextContent('100,00%')
    expect(full).toHaveTextContent(`IC 95% ${percentFormat.format(0.97)}–${percentFormat.format(1)}`)

    // Libertadores inclusiva: 0 sucessos com denominador 100 é ausência de
    // observação do destino, não ausência de simulações.
    await user.click(screen.getByRole('button', { name: 'Libertadores' }))
    const libertadoresTable = screen.getByRole('region', { name: /Chance de ser classificado para a Libertadores por pontuação exata/ })
    const libertadoresRows = within(libertadoresTable).getAllByRole('row').slice(1)
    const libertadoresRowFor = (points: string): HTMLElement => libertadoresRows.find((row) => row.querySelector('th')?.textContent === points)!

    const inclusiveZero = libertadoresRowFor('50')
    expect(inclusiveZero).toHaveTextContent('0 de 100 observações')
    expect(inclusiveZero.querySelector('.cell-ci')).toBeNull()
    expect(inclusiveZero.querySelector('.magic-bar-fill')).toBeNull()
    expect(within(inclusiveZero).getByRole('img'))
      .toHaveAccessibleName('Com 50 pontos: nenhuma observação de classificação para a Libertadores em 100 simulações desta pontuação')

    const inclusiveObserved = libertadoresRowFor('51')
    expect(inclusiveObserved).toHaveTextContent('30,00%')
    expect(inclusiveObserved).toHaveTextContent(`IC 95% ${percentFormat.format(0.22)}–${percentFormat.format(0.39)}`)
  })

  it('decide a estimativa pela contagem de sucessos, não pelo texto percentual formatado', async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    // Denominador grande o bastante para que 1 sucesso formate “0,00%”.
    const bigDenominator = 381_699
    expect(percentFormat.format(1 / bigDenominator)).toBe('0,00%')
    result.pointCurve = {
      simulationCount: bigDenominator,
      inclusiveLibertadores: [],
      rows: [
        // 1 sucesso em 381.699 formata “0,00%”, mas a linha TEM observação:
        // deve exibir percentual + IC, não “0 de N observações”.
        {
          points: 42, outcome: 'sudamericana', successes: 1, denominator: bigDenominator,
          probability: 1 / bigDenominator, lower95: 0, upper95: 0.000009, clusterCount: 1, lowSample: false,
        },
        // Zero sucessos no mesmo denominador: ausência de observação do destino.
        {
          points: 43, outcome: 'sudamericana', successes: 0, denominator: bigDenominator,
          probability: 0, lower95: 0, upper95: 0, clusterCount: 0, lowSample: false,
        },
      ],
    }
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))
    await user.click(screen.getByRole('button', { name: 'Sul-Americana' }))

    const table = screen.getByRole('region', { name: /Chance de ser classificado para a Sul-Americana por pontuação exata/ })
    const rows = within(table).getAllByRole('row').slice(1)
    const rowFor = (points: string): HTMLElement => rows.find((row) => row.querySelector('th')?.textContent === points)!

    const singleSuccess = rowFor('42')
    expect(singleSuccess).not.toHaveTextContent('observações')
    expect(singleSuccess.querySelector('td.games-cell')).toHaveTextContent('0,00%')
    expect(singleSuccess.querySelector('.magic-bar-fill')).not.toBeNull()
    expect(singleSuccess.querySelector('.cell-ci')!.textContent).toMatch(/^IC 95% /)
    expect(singleSuccess.querySelector('.magic-bar')).toHaveAccessibleName(/0,00% de classificado para a Sul-Americana; IC 95% /)

    const zeroSuccess = rowFor('43')
    expect(zeroSuccess).toHaveTextContent('0 de 381.699 observações')
    expect(zeroSuccess.querySelector('td.games-cell')!.textContent).not.toMatch(/%/)
    expect(zeroSuccess.querySelector('.magic-bar-fill')).toBeNull()
    expect(zeroSuccess.querySelector('.magic-bar')).toHaveAccessibleName(
      'Com 43 pontos: nenhuma observação de classificação para a Sul-Americana em 381.699 simulações desta pontuação',
    )
  })

  it('não agrupa pontuações com denominadores ou ICs diferentes', async () => {
    const user = userEvent.setup()
    const result = runProjection({ simulations: 8, seed: 123 })
    const outcomes = [
      ['title', 1, 0.05, 0.15],
      ['libertadores', 2, 0.1, 0.3],
      ['sudamericana', 4, 0.3, 0.5],
      ['middle', 2, 0.1, 0.3],
      ['relegation', 1, 0.05, 0.15],
    ] as const
    result.pointCurve = {
      simulationCount: 20,
      inclusiveLibertadores: [
        { points: 50, successes: 3, denominator: 10, probability: 0.3, lower95: 0.2, upper95: 0.4, clusterCount: 10, lowSample: false },
        { points: 51, successes: 6, denominator: 20, probability: 0.3, lower95: 0.25, upper95: 0.35, clusterCount: 20, lowSample: true },
      ],
      rows: outcomes.flatMap(([outcome, successes, lower95, upper95]) => [
        { points: 50, outcome, successes, denominator: 10, probability: successes / 10, lower95, upper95, clusterCount: 10, lowSample: false },
        { points: 51, outcome, successes: successes * 2, denominator: 20, probability: successes / 10, lower95: lower95 + 0.01, upper95: upper95 - 0.01, clusterCount: 20, lowSample: true },
      ]),
    }
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Por pontuação' }))
    const table = screen.getByRole('region', { name: /Chance de ser rebaixado para a Série B por pontuação exata/ })

    expect(screen.getByText(/Apenas pontos consecutivos com as mesmas probabilidades, sucessos, denominadores, clusters, ICs e sinalizadores de amostra baixa são agrupados/)).toBeVisible()
    expect(within(table).getByRole('row', { name: /50/ })).toHaveTextContent('IC 95% 5,00%–15,00%')
    expect(within(table).getByRole('row', { name: /51/ })).toHaveTextContent('IC 95% 6,00%–14,00%')
    expect(within(table).queryByRole('row', { name: /50–51/ })).not.toBeInTheDocument()
  })

  it('particiona as barras em categorias exclusivas cuja soma não excede 100%', { timeout: 30_000 }, () => {
    const result = runProjection({ simulations: 8, seed: 123 })
    const firstClub = result.clubProbabilities[0]!
    result.clubProbabilities = [
      { ...firstClub, title: 0.1, libertadores: 0.4, sudamericana: 0.2, relegation: 0.1 },
      ...result.clubProbabilities.slice(1),
    ]
    render(<ProjectionPanel result={result} status="ready" onRetry={vi.fn()} />)

    const bar = screen.getByRole('img', { name: new RegExp(`Cenários de ${firstClub.club}`) })
    const widths = [...bar.querySelectorAll('.zone-bar-segment')].map((segment) => Number.parseFloat((segment as HTMLElement).style.width))
    const zones = screen.getByRole('region', { name: /Zonas possíveis por clube/ })
    const row = within(zones).getByRole('row', { name: new RegExp(firstClub.club) })
    const displayedChances = [...row.querySelectorAll('.probability-cell strong')].map((cell) => cell.textContent)
    expect(widths).toHaveLength(5)
    expect(widths[0]).toBeCloseTo(10)
    expect(widths[1]).toBeCloseTo(30)
    expect(widths[2]).toBeCloseTo(20)
    expect(widths[3]).toBeCloseTo(30)
    expect(widths[4]).toBeCloseTo(10)
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
    expect(displayedChances).toEqual([
      percentFormat.format(0.1),
      percentFormat.format(0.4),
      percentFormat.format(0.2),
      percentFormat.format(0.1),
    ])
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
    expect(screen.queryByRole('region', { name: /Pontos finais projetados por clube/ })).not.toBeInTheDocument()
    if (status === 'error') {
      expect(screen.getByRole('alert')).toHaveTextContent('Nenhum percentual foi substituído por estimativa manual.')
    }
  })
})
