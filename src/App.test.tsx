import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('painel do Brasileirão 2026', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    window.history.replaceState(null, '', ' ')
  })

  it('permite selecionar e persistir o tema de exibição', async () => {
    const user = userEvent.setup()
    render(<App />)

    const themeSelect = screen.getByRole('combobox', { name: 'Tema de exibição' })
    expect(themeSelect).toHaveValue('system')

    await user.selectOptions(themeSelect, 'dark')

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('br2026-theme')).toBe('dark')
  })

  it('organiza o painel em quatro abas acessíveis com seleção por clique e teclado', async () => {
    const user = userEvent.setup()
    render(<App />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Visão Geral', 'Jogos & Resultados', 'Projeções & Métricas', 'Dados & Auditoria'])
    const tablist = screen.getByRole('tablist', { name: 'Navegação principal' })
    expect(within(tablist).getAllByRole('tab')).toHaveLength(4)

    // Aba inicial: Visão Geral visível; as demais ocultas.
    expect(screen.getByRole('tabpanel', { name: 'Visão Geral' })).toBeVisible()
    expect(document.getElementById('painel-jogos')!.hidden).toBe(true)
    expect(document.getElementById('painel-projecoes')!.hidden).toBe(true)
    expect(document.getElementById('painel-dados')!.hidden).toBe(true)

    // Seleção por clique troca o painel visível.
    await user.click(screen.getByRole('tab', { name: 'Jogos & Resultados' }))
    expect(screen.getByRole('tabpanel', { name: 'Jogos & Resultados' })).toBeVisible()
    expect(document.getElementById('painel-visao-geral')!.hidden).toBe(true)
    expect(screen.getByRole('heading', { name: 'Resultados 2026' })).toBeVisible()

    // Teclado: setas movem a seleção com foco gerenciado (roving tabindex).
    const projecoesTab = screen.getByRole('tab', { name: 'Projeções & Métricas' })
    projecoesTab.focus()
    await user.keyboard('{ArrowRight}')
    const dadosTab = screen.getByRole('tab', { name: 'Dados & Auditoria' })
    expect(dadosTab).toHaveAttribute('aria-selected', 'true')
    expect(dadosTab).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Dados & Auditoria' })).toBeVisible()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Projeções & Métricas' })).toHaveAttribute('aria-selected', 'true')

    // End vai à última aba; Home volta à primeira.
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Dados & Auditoria' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Visão Geral' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Visão Geral' })).toBeVisible()
  })

  it('abre a aba correta a partir de âncoras legadas da versão anterior', async () => {
    render(<App />)
    expect(screen.getByRole('tabpanel', { name: 'Visão Geral' })).toBeVisible()

    window.history.replaceState(null, '', '#estatisticas')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Projeções & Métricas' })).toBeVisible())

    window.history.replaceState(null, '', '#dados')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Dados & Auditoria' })).toBeVisible())
  })

  it('mostra KPIs executivos da temporada na visão geral', () => {
    render(<App />)

    const kpis = screen.getByRole('region', { name: 'Indicadores da temporada' })
    expect(within(kpis).getByText('Pontos do líder · Flamengo')).toBeInTheDocument()
    expect(within(kpis).getByText('Jogos disputados no corte')).toBeInTheDocument()
    expect(within(kpis).getByText('Vagas de Libertadores (1º–5º)')).toBeInTheDocument()
    expect(within(kpis).getByText('Jogos restantes · 4 rodadas + adiados')).toBeInTheDocument()
  })

  it('ordena a classificação por pontos ao clicar no cabeçalho', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^PTS/ }))
    const table = screen.getByRole('region', { name: /Tabela classificatória/ })
    // Ascendente: menor pontuação primeiro (Chapecoense, 21 pts)
    expect(within(table).getAllByRole('row')[1]!).toHaveTextContent('Chapecoense')
    expect(within(table).getByRole('columnheader', { name: /PTS/ })).toHaveAttribute('aria-sort', 'ascending')

    await user.click(screen.getByRole('button', { name: /^PTS/ }))
    // Descendente: líder primeiro (Flamengo, 73 pts)
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Flamengo')
    expect(within(table).getByRole('columnheader', { name: /PTS/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('mostra os 20 clubes na ordem oficial, com pontos e jogos do snapshot', () => {
    render(<App />)

    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(21)
    const renderedStandings = rows.slice(1).map((row) => {
      const cells = row.querySelectorAll('th, td')
      return [
        cells[0]?.textContent?.trim(),
        row.querySelector('.club-cell > span:last-child')?.textContent?.trim(),
        cells[2]?.textContent?.trim(),
        cells[3]?.textContent?.trim(),
      ]
    })
    expect(renderedStandings).toEqual([
      ['01', 'Flamengo', '73', '33'],
      ['02', 'Palmeiras', '70', '33'],
      ['03', 'Cruzeiro', '57', '33'],
      ['04', 'Fluminense', '54', '33'],
      ['05', 'Athletico Paranaense', '54', '33'],
      ['06', 'Bahia', '53', '33'],
      ['07', 'Atlético Mineiro', '50', '33'],
      ['08', 'Red Bull Bragantino', '47', '34'],
      ['09', 'Santos FC', '47', '34'],
      ['10', 'São Paulo', '43', '33'],
      ['11', 'Coritiba SAF', '42', '34'],
      ['12', 'Mirassol', '40', '34'],
      ['13', 'Botafogo', '39', '33'],
      ['14', 'Vasco da Gama SAF', '38', '32'],
      ['15', 'Vitória', '38', '33'],
      ['16', 'Internacional', '38', '34'],
      ['17', 'Grêmio', '37', '33'],
      ['18', 'Corinthians', '36', '33'],
      ['19', 'Remo', '29', '33'],
      ['20', 'Chapecoense', '21', '33'],
    ])
    const sourceSummary = screen.getByRole('region', { name: 'Fonte e horário dos dados' })
    expect(within(sourceSummary).getByText(/Corte analítico: 04\/11\/2026 · 13:00 BRT · arquivos capturados ~16:41 BRT; HTML CBF exibe 04\/11\/2026 - 19:41, fuso\/semântica desconhecidos/)).toBeInTheDocument()
    expect(screen.getByText(/A classificação foi reconciliada em agregado ao conjunto de jogos até 04\/11\/2026 13:00 BRT/)).toBeInTheDocument()
    expect(screen.queryByText(/snapshot CBF de 04\/11\/2026 às 13:00/)).not.toBeInTheDocument()
  })

  it('identifica os dados como snapshot estático sem atualização ao vivo', () => {
    render(<App />)

    const sourceSummary = screen.getByRole('region', { name: 'Fonte e horário dos dados' })
    expect(within(sourceSummary).getByText('Snapshot estático')).toBeInTheDocument()
    expect(within(sourceSummary).getByText('Sem atualização ao vivo.')).toBeInTheDocument()
  })

  it('pesquisa a classificação pelo nome do clube', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox', { name: 'Buscar clube na classificação' }), 'vasco')

    expect(screen.getByRole('row', { name: /Vasco da Gama SAF/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Flamengo/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 clube encontrado')).toBeInTheDocument()
  })

  it('filtra a lista de clubes por zona de rebaixamento', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Rebaixamento' }))

    const clubList = screen.getByRole('list', { name: 'Clubes filtrados por zona' })
    expect(within(clubList).getAllByRole('listitem')).toHaveLength(4)
    expect(within(clubList).getByText('Corinthians')).toBeInTheDocument()
    expect(within(clubList).getByText('Chapecoense')).toBeInTheDocument()
    expect(within(clubList).queryByText('Flamengo')).not.toBeInTheDocument()
  })

  it('preserva os três artilheiros empatados na quinta posição', () => {
    render(<App />)

    const topScorers = screen.getByRole('list', { name: 'Artilharia' })
    expect(within(topScorers).getAllByText('5º')).toHaveLength(3)
    expect(within(topScorers).getByText('Samuel Lino')).toBeInTheDocument()
    expect(within(topScorers).getByText('Luciano Juba')).toBeInTheDocument()
    expect(within(topScorers).getByText('Vinicius')).toBeInTheDocument()
    expect(screen.getByText(/Horário de captura específico da lista não informado/)).toBeInTheDocument()
  })

  it('identifica as fontes oficiais e a conferência secundária', () => {
    render(<App />)

    expect(screen.getByRole('link', { name: /Fonte oficial: CBF/ })).toHaveAttribute(
      'href',
      'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026',
    )
    expect(screen.getByRole('link', { name: /ESPN · Conferência de artilharia/ })).toHaveAttribute(
      'href',
      'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols',
    )
  })
})
