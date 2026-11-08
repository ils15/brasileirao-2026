import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StandingsViews } from './StandingsViews'
import { standingsFromResults } from './rounds'
import { currentClubs } from './projectionData'

describe('aba classificações', () => {
  it('abre na vista geral com as 20 linhas e colunas completas', () => {
    render(<StandingsViews />)
    const table = screen.getByRole('region', { name: /Classificação geral/ })
    expect(within(table).getAllByRole('row')).toHaveLength(21)
    expect(within(table).getByRole('columnheader', { name: /^Pts/ })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /^GP/ })).toBeInTheDocument()
    // Líder da tabela derivada na primeira linha de dados
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Flamengo')
  })

  it('separa a norma oficial, a ordem desta tabela e o limite temporal de cartões antes das vistas', () => {
    render(<StandingsViews />)
    const limitation = screen.getByRole('note', { name: 'Limitação do desempate pelo Art. 15 da CBF' })
    const viewTabs = screen.getByRole('tablist', { name: 'Vistas da classificação' })

    expect(limitation).toBeVisible()
    expect(limitation).toHaveTextContent(/Art\. 15 — norma oficial:.*confronto direto.*menos cartões vermelhos.*menos cartões amarelos.*sorteio/)
    expect(limitation).toHaveTextContent(/para três ou mais, H2H não se aplica/)
    expect(limitation).toHaveTextContent(/Nesta tabela:.*pontos.*nome do clube; não aplica integralmente o Art\. 15 nem representa uma classificação oficial da CBF/)
    expect(limitation).toHaveTextContent(/Limite temporal:.*posterior ao corte analítico 2026-11-07T00:58:14\.422Z.*não tem cobertura temporal por partida suficiente.*naquele corte/)
    expect(limitation.compareDocumentPosition(viewTabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('troca entre as oito vistas por clique e teclado', async () => {
    const user = userEvent.setup()
    render(<StandingsViews />)
    expect(screen.getAllByRole('tab')).toHaveLength(8)

    await user.click(screen.getByRole('tab', { name: 'Últimas 10 rodadas' }))
    const lastTen = screen.getByRole('region', { name: /últimas 10 rodadas completas/i })
    expect(within(lastTen).getAllByRole('row')).toHaveLength(21)

    const mandanteTab = screen.getByRole('tab', { name: 'Mandante' })
    mandanteTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Visitante' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: /só jogos como visitante|só com jogos como visitante/ })).toBeInTheDocument()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true')
  })

  it('vista de mandantes soma só jogos em casa (menor total que a geral)', async () => {
    const user = userEvent.setup()
    render(<StandingsViews />)
    const geral = screen.getByRole('region', { name: /Classificação geral/ })
    const geralCells = within(within(geral).getAllByRole('row')[1]!).getAllByRole('cell')
    const flamengo = currentClubs.find(({ id }) => id === 'flamengo')!
    // Snapshot antes do clique: o React reutiliza as <tr> entre vistas
    const geralPlayed = Number(geralCells[2]!.textContent)
    expect(geralPlayed).toBe(flamengo.played)

    await user.click(screen.getByRole('tab', { name: 'Mandante' }))
    const mandante = screen.getByRole('region', { name: /mandante/ })
    const mandanteCells = within(within(mandante).getAllByRole('row')[1]!).getAllByRole('cell')
    const mandantePlayed = Number(mandanteCells[2]!.textContent)
    expect(mandantePlayed).toBeLessThan(flamengo.played)
  })

  it('ordena a vista geral por gols pró ao clicar no cabeçalho', async () => {
    const user = userEvent.setup()
    render(<StandingsViews />)
    await user.click(screen.getByRole('button', { name: /^GP/ }))
    const table = screen.getByRole('region', { name: /Classificação geral/ })
    // Numéricas começam descendente: maior GP primeiro (Flamengo, 71)
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Flamengo')
    expect(within(table).getByRole('columnheader', { name: /^GP/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('mostra o gráfico de evolução com seleção de foco, faixas de zona e acessibilidade', async () => {
    const user = userEvent.setup()
    render(<StandingsViews />)
    await user.click(screen.getByRole('tab', { name: 'Evolução por rodada' }))
    // 20 chips de seleção; Flamengo e Palmeiras destacados por padrão
    const picker = screen.getByRole('group', { name: 'Selecionar clubes para destacar no gráfico' })
    expect(within(picker).getAllByRole('button')).toHaveLength(20)
    const chart = screen.getByRole('img', { name: /Destacados: Flamengo, Palmeiras/ })
    expect(chart).toBeInTheDocument()
    expect(chart.querySelectorAll('polyline')).toHaveLength(20)
    expect(chart.querySelectorAll('.evolution-band')).toHaveLength(2)
    expect(screen.getByText(/o último ponto coincide com a tabela derivada do pacote/)).toBeInTheDocument()

    // Clique destaca/desdestaca
    await user.click(within(picker).getByRole('button', { name: /Cruzeiro/ }))
    expect(screen.getByRole('img', { name: /Destacados: Flamengo, Palmeiras, Cruzeiro/ })).toBeInTheDocument()
    await user.click(within(picker).getByRole('button', { name: /Flamengo/ }))
    expect(screen.getByRole('img', { name: /Destacados: Palmeiras, Cruzeiro/ })).toBeInTheDocument()
  })

  it('exibe sequências vigentes e extremos de ataque/defesa', async () => {
    const user = userEvent.setup()
    render(<StandingsViews />)
    await user.click(screen.getByRole('tab', { name: 'Sequências e extremos' }))
    const streaks = screen.getByRole('region', { name: 'Sequências vigentes por clube' })
    expect(within(streaks).getAllByRole('row')).toHaveLength(21)
    expect(screen.getByText(/Melhor ataque ·/)).toBeInTheDocument()
    expect(screen.getByText(/Melhor defesa ·/)).toBeInTheDocument()
    // Todos os 20 clubes têm linha
    for (const club of currentClubs.slice(0, 3)) {
      expect(within(streaks).getByRole('row', { name: new RegExp(club.club) })).toBeInTheDocument()
    }
  })

  it('as vistas derivadas batem com standingsFromResults', async () => {
    const user = userEvent.setup()
    render(<StandingsViews />)
    await user.click(screen.getByRole('tab', { name: 'Turno (1º–19º)' }))
    const turno = screen.getByRole('region', { name: /turno/ })
    // Vista começa ordenada por pontos ascendente: o líder fica na ÚLTIMA linha
    const expectedLeader = standingsFromResults({ fromRound: 1, toRound: 19 })[0]!
    const rows = within(turno).getAllByRole('row')
    expect(rows.at(-1)).toHaveTextContent(expectedLeader.club)
    expect(rows.at(-1)!.textContent).toContain(String(expectedLeader.points))
  })
})
