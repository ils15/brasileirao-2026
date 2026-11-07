import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { currentClubs } from './projectionData'
import { cutoffSummaryLine } from './seasonFacts'
import { scorers, SCORERS_SOURCE } from './data'

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

  it('organiza o painel em sete abas acessíveis com seleção por clique e teclado', async () => {
    const user = userEvent.setup()
    render(<App />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Visão Geral', 'Classificações', 'Jogos', 'Confrontos', 'Projeções', 'Metodologia & Validação', 'Dados & Auditoria',
    ])
    const tablist = screen.getByRole('tablist', { name: 'Navegação principal' })
    expect(within(tablist).getAllByRole('tab')).toHaveLength(7)

    // Aba inicial: Visão Geral visível; as demais ocultas.
    expect(screen.getByRole('tabpanel', { name: 'Visão Geral' })).toBeVisible()
    expect(document.getElementById('painel-classificacoes')!.hidden).toBe(true)
    expect(document.getElementById('painel-jogos')!.hidden).toBe(true)
    expect(document.getElementById('painel-confrontos')!.hidden).toBe(true)
    expect(document.getElementById('painel-projecoes')!.hidden).toBe(true)
    expect(document.getElementById('painel-metodologia')!.hidden).toBe(true)
    expect(document.getElementById('painel-dados')!.hidden).toBe(true)

    // Seleção por clique troca o painel visível.
    await user.click(screen.getByRole('tab', { name: 'Confrontos' }))
    expect(screen.getByRole('tabpanel', { name: 'Confrontos' })).toBeVisible()
    expect(document.getElementById('painel-visao-geral')!.hidden).toBe(true)
    expect(screen.getByRole('heading', { name: 'Próxima rodada' })).toBeVisible()

    // Teclado: setas movem a seleção com foco gerenciado (roving tabindex).
    const projecoesTab = screen.getByRole('tab', { name: 'Projeções' })
    projecoesTab.focus()
    await user.keyboard('{ArrowRight}')
    const metodologiaTab = screen.getByRole('tab', { name: 'Metodologia & Validação' })
    expect(metodologiaTab).toHaveAttribute('aria-selected', 'true')
    expect(metodologiaTab).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Metodologia & Validação' })).toBeVisible()

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
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Metodologia & Validação' })).toBeVisible())

    window.history.replaceState(null, '', '#dados')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Dados & Auditoria' })).toBeVisible())

    window.history.replaceState(null, '', '#calendario')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Jogos' })).toBeVisible())
  })

  it('exibe as análises da aba Classificações e da aba Confrontos', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Classificações' }))
    expect(screen.getByRole('heading', { name: 'Classificações' })).toBeVisible()
    expect(screen.getByRole('tablist', { name: 'Vistas da classificação' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Confrontos' }))
    expect(screen.getByRole('heading', { name: 'Próxima rodada' })).toBeVisible()
    expect(screen.getByRole('heading', { name: /Confronto direto|Flamengo × Palmeiras/ })).toBeVisible()
  })

  it('mostra KPIs executivos da temporada na visão geral', () => {
    render(<App />)

    const kpis = screen.getByRole('region', { name: 'Indicadores da temporada' })
    expect(within(kpis).getByText('Pontos do líder · Flamengo')).toBeInTheDocument()
    expect(within(kpis).getByText('Jogos disputados no corte')).toBeInTheDocument()
    expect(within(kpis).getByText('Vagas de Libertadores (1º–5º)')).toBeInTheDocument()
    expect(within(kpis).getByText('Jogos restantes · rodadas + adiados')).toBeInTheDocument()
  })

  it('ordena a classificação por pontos ao clicar no cabeçalho', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^Pts/ }))
    const table = screen.getByRole('region', { name: /Tabela classificatória/ })
    // Numéricas começam descendente: líder primeiro
    expect(within(table).getAllByRole('row')[1]!).toHaveTextContent(currentClubs[0]!.club)
    expect(within(table).getByRole('columnheader', { name: /Pts/ })).toHaveAttribute('aria-sort', 'descending')

    await user.click(screen.getByRole('button', { name: /^Pts/ }))
    // Segundo clique: ascendente (lanterna primeiro)
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(currentClubs[currentClubs.length - 1]!.club)
    expect(within(table).getByRole('columnheader', { name: /Pts/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('mostra os 20 clubes na ordem oficial, com pontos e jogos do snapshot', () => {
    render(<App />)

    // A classificação da Visão Geral (outras abas também têm tabelas no DOM)
    const standingsTable = screen.getByRole('region', { name: /Tabela classificatória/ })
    const rows = within(standingsTable).getAllByRole('row')
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
    // Invariante: a tabela renderizada reflete o snapshot derivado dos dados
    expect(renderedStandings).toEqual(currentClubs.map((club) => [
      String(club.position).padStart(2, '0'),
      club.club,
      String(club.points),
      String(club.played),
    ]))
    const sourceSummary = screen.getByRole('region', { name: 'Fonte e horário dos dados' })
    expect(within(sourceSummary).getByText(cutoffSummaryLine)).toBeInTheDocument()
    expect(screen.getByText(/A classificação foi reconciliada em agregado ao conjunto de jogos até 04\/11\/2026 13:00 BRT/)).toBeInTheDocument()
    expect(screen.queryByText(/snapshot CBF de 04\/11\/2026 às 13:00/)).not.toBeInTheDocument()
  })

  it('identifica os dados como snapshot estático sem atualização ao vivo', () => {
    render(<App />)

    const sourceSummary = screen.getByRole('region', { name: 'Fonte e horário dos dados' })
    expect(within(sourceSummary).getByText('Snapshot automático')).toBeInTheDocument()
    expect(within(sourceSummary).getByText('Sem placares ao vivo — atualização automática a cada 2 horas.')).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Série B' }))

    const clubList = screen.getByRole('list', { name: 'Clubes filtrados por zona' })
    // Invariante: sempre os quatro últimos do snapshot
    const relegated = currentClubs.filter((club) => club.position >= 17)
    expect(within(clubList).getAllByRole('listitem')).toHaveLength(4)
    for (const club of relegated) {
      expect(within(clubList).getByText(club.club)).toBeInTheDocument()
    }
    expect(within(clubList).queryByText(currentClubs[0]!.club)).not.toBeInTheDocument()
  })

  it('artilharia derivada da fonte: ordem por gols, empates compartilham posição e fonte declarada', () => {
    render(<App />)

    const topScorers = screen.getByRole('list', { name: 'Artilharia' })
    // Ordenação estrita por gols descendente nos itens renderizados
    const goalCounts = [...topScorers.querySelectorAll('.goal-count strong')].map((element) => Number(element.textContent))
    expect(goalCounts.length).toBe(scorers.length)
    for (let index = 1; index < goalCounts.length; index += 1) {
      expect(goalCounts[index - 1]).toBeGreaterThanOrEqual(goalCounts[index]!)
    }
    // Líder na 1ª posição com o máximo do dataset
    expect(within(topScorers).getAllByText('1º')[0]).toBeInTheDocument()
    // Empates derivados: o primeiro grupo de gols repetidos exibe a MESMA
    // posição para todos os seus membros (sem exclusão ordinal)
    const firstTie = scorers.findIndex((scorer, index) => index > 0 && scorer.goals === scorers[index - 1]!.goals)
    if (firstTie > 0) {
      const tiedGoals = scorers[firstTie]!.goals
      const tiedCount = scorers.filter((scorer) => scorer.goals === tiedGoals).length
      const tiedPosition = scorers[firstTie]!.position
      expect(within(topScorers).getAllByText(tiedPosition)).toHaveLength(tiedCount)
    }
    expect(screen.getByText(new RegExp(SCORERS_SOURCE.name))).toBeInTheDocument()
    expect(screen.getByText(/atualizada automaticamente após cada rodada/)).toBeInTheDocument()
  })

  it('identifica as fontes oficiais e a conferência secundária', () => {
    render(<App />)

    for (const cbfLink of screen.getAllByRole('link', { name: /CBF/ })) {
      expect(cbfLink).toHaveAttribute(
        'href',
        'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026',
      )
    }
    expect(screen.getByRole('link', { name: /ESPN · Conferência de artilharia/ })).toHaveAttribute(
      'href',
      'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols',
    )
  })
})
