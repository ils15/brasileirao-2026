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

  it('restaura o tema Sistema depois de salvar essa preferência e recarregar o app', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    const themeSelect = screen.getByRole('combobox', { name: 'Tema de exibição' })

    await user.selectOptions(themeSelect, 'dark')
    await user.selectOptions(themeSelect, 'system')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
    expect(window.localStorage.getItem('br2026-theme')).toBe('system')

    view.unmount()
    render(<App />)
    expect(screen.getByRole('combobox', { name: 'Tema de exibição' })).toHaveValue('system')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
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

  it('mostra os rótulos das quatro zonas junto à classificação, sem depender só da cor', () => {
    render(<App />)

    const table = screen.getByRole('region', { name: /Tabela classificatória/ })
    expect(within(table).getAllByText('Libertadores · 1º–6º*')).toHaveLength(6)
    expect(within(table).getAllByText('Sul-Americana · 7º–12º')).toHaveLength(6)
    expect(within(table).getAllByText('Meio de tabela · 13º–16º')).toHaveLength(4)
    expect(within(table).getAllByText('Rebaixamento · 17º–20º')).toHaveLength(4)
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Libertadores · 1º–6º*')
    expect(rows[5]).toHaveTextContent('Libertadores · 1º–6º*')
    expect(rows[6]).toHaveTextContent('Sul-Americana · 7º–12º')
    expect(rows[11]).toHaveTextContent('Sul-Americana · 7º–12º')
    expect(rows[12]).toHaveTextContent('Meio de tabela · 13º–16º')
    expect(rows[16]).toHaveTextContent('Rebaixamento · 17º–20º')
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
    expect(screen.getAllByText(/Libertadores · 1º–6º\*/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sul-Americana · 7º–12º').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Meio de tabela · 13º–16º').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rebaixamento · 17º–20º').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: 'Confrontos' }))
    expect(screen.getByRole('heading', { name: 'Próxima rodada' })).toBeVisible()
    expect(screen.getByRole('heading', { name: /Confronto direto|Flamengo × Palmeiras/ })).toBeVisible()
  })

  it('mostra KPIs executivos da temporada na visão geral', () => {
    render(<App />)

    const kpis = screen.getByRole('region', { name: 'Indicadores da temporada' })
    expect(within(kpis).getByText('Pontos do líder · Flamengo')).toBeInTheDocument()
    expect(within(kpis).getByText('Jogos disputados no corte')).toBeInTheDocument()
    expect(within(kpis).getByText('Vagas de Libertadores (1º–6º*)')).toBeInTheDocument()
    expect(within(kpis).getByText('Jogos restantes · rodadas + adiados')).toBeInTheDocument()
    const zoneLegend = screen.getByRole('group', { name: 'Legenda das zonas da tabela' })
    const g6Note = screen.getByText(/G-6 é cenário adotado com redistribuição assumida.*não é automática/i)
    expect(g6Note).toBeVisible()
    expect(zoneLegend).toHaveAttribute('aria-describedby', g6Note.id)
    expect(screen.getByText((_, element) => element?.classList.contains('leader-stat-caption') ?? false)).toHaveTextContent('Classificação derivada do pacote')
    expect(screen.getByText(/classificação calculada dos resultados do pacote; a cópia CBF arquivada soma 332 jogos e não valida este conjunto/i)).toBeInTheDocument()
    expect(screen.queryByText('Classificação oficial')).not.toBeInTheDocument()
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
        row.querySelector('.club-cell-name')?.textContent?.trim(),
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
    expect(screen.getByText(/Corte analítico dos resultados: 06\/11\/2026 · 21:58:14 BRT/)).toBeInTheDocument()
    expect(screen.getByText(/o HTML CBF arquivado soma 332 jogos e não valida o conjunto/i)).toBeInTheDocument()
    expect(screen.queryByText(/snapshot CBF de 04\/11\/2026 às 13:00/)).not.toBeInTheDocument()
  })

  it('identifica os dados como snapshot estático sem atualização ao vivo', () => {
    render(<App />)

    const sourceSummary = screen.getByRole('region', { name: 'Fonte e horário dos dados' })
    expect(within(sourceSummary).getByText('Snapshot automático')).toBeInTheDocument()
    expect(within(sourceSummary).getByText('Sem placares ao vivo — atualização automática a cada 2 horas.')).toBeInTheDocument()
  })

  it('distingue o corte analítico da captura sem cobertura temporal comprovada da artilharia', () => {
    render(<App />)

    const sourceSummary = screen.getByRole('region', { name: 'Fonte e horário dos dados' })
    expect(within(sourceSummary).getByText('Resultados e análises até 06/11/2026 · 21:58:14 BRT · nova verificação automática a cada 2 horas')).toBeInTheDocument()
    expect(screen.getByText(/captura 07\/11\/2026 · 16:00:24 UTC · posterior ao corte analítico; sem timestamp por partida, cobertura temporal não verificada/)).toBeInTheDocument()
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

  it('artilharia derivada da fonte: primeira página ordenada, empates preservados e fonte declarada', () => {
    render(<App />)

    const topScorers = screen.getByRole('list', { name: 'Artilharia' })
    // Ordenação estrita por gols descendente nos itens renderizados
    const goalCounts = [...topScorers.querySelectorAll('.goal-count strong')].map((element) => Number(element.textContent))
    expect(goalCounts.length).toBe(20)
    expect([...topScorers.querySelectorAll('.scorer-info strong')].map((element) => element.textContent)).toEqual(
      scorers.slice(0, 20).map((scorer) => scorer.name),
    )
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
    const scorersPanel = screen.getByRole('region', { name: 'Artilharia' })
    expect(within(scorersPanel).getByText(new RegExp(SCORERS_SOURCE.name))).toBeInTheDocument()
    expect(within(scorersPanel).getByText(/sem timestamp por partida, cobertura temporal não verificada/)).toBeInTheDocument()
  })

  it('separa classificação derivada, artilharia pós-corte e data programada do registro do evento', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText(/Classificação calculada dos resultados do pacote/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Classificação oficial/ })).not.toBeInTheDocument()
    expect(screen.getByText(/não representa a artilharia no corte/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Jogos' }))
    expect(screen.getByRole('columnheader', { name: 'Data/hora na fonte' })).toBeInTheDocument()
    const eventDateNote = screen.getByText(/Todos os .* resultados até o corte analítico/)
    expect(eventDateNote.textContent).toContain('REF 340')
    expect(eventDateNote.textContent).toContain('04/11 ou 05/11')
    expect(eventDateNote.textContent).toContain('2026-11-03T22:30Z')
    expect(eventDateNote.textContent).toContain('O pacote não confirma o kickoff oficial.')

    await user.click(screen.getByRole('tab', { name: 'Confrontos' }))
    const tiebreakNote = screen.getByText(/O desempate simulado \(não é classificação oficial\)/)
    expect(tiebreakNote.textContent).toContain('nem aplicação integral do Art. 15')

    await user.click(screen.getByRole('tab', { name: 'Dados & Auditoria' }))
    expect(screen.getByRole('heading', { name: 'CBF (HTML de classificação arquivado)' })).toBeInTheDocument()
    expect(screen.getByText(/Exibe 04\/11\/2026 - 19:41 \(fuso e significado não declarados\)/)).toBeInTheDocument()
  })

  it('pagina os 305 atletas sem alterar ordem, posições ou perder/duplicar atletas', async () => {
    const user = userEvent.setup()
    render(<App />)

    const scorersPanel = screen.getByRole('region', { name: 'Artilharia' })
    const scorerList = within(scorersPanel).getByRole('list', { name: 'Artilharia' })
    const pagination = within(scorersPanel).getByRole('navigation', { name: 'Paginação da artilharia' })
    const next = within(scorersPanel).getByRole('button', { name: 'Próxima página da artilharia' })
    const previous = within(scorersPanel).getByRole('button', { name: 'Página anterior da artilharia' })
    const pageCount = Math.ceil(scorers.length / 20)
    const renderedScorers = (): Array<{ name: string; club: string; position: string; goals: number }> =>
      [...scorerList.querySelectorAll('.scorer-item')].map((item) => ({
        name: item.querySelector('.scorer-info strong')?.textContent ?? '',
        club: item.querySelector('.scorer-info small')?.textContent ?? '',
        position: item.querySelector('.scorer-rank')?.textContent ?? '',
        goals: Number(item.querySelector('.goal-count strong')?.textContent),
      }))
    const renderedIdentities: string[] = []

    expect(scorers).toHaveLength(305)
    expect(pageCount).toBe(16)
    expect(pagination).toHaveTextContent(`1–20 de ${scorers.length}`)
    expect(pagination).toHaveTextContent('Página 1 de 16')
    expect(pagination.querySelector('[aria-live="polite"]')).toHaveAttribute('aria-atomic', 'true')
    expect(previous).toBeDisabled()

    for (let page = 0; page < pageCount; page += 1) {
      const start = page * 20
      const end = Math.min(start + 20, scorers.length)
      const expectedPage = scorers.slice(start, end)

      expect(pagination).toHaveTextContent(`${start + 1}–${end} de ${scorers.length}`)
      expect(pagination).toHaveTextContent(`Página ${page + 1} de ${pageCount}`)
      expect(renderedScorers()).toEqual(expectedPage.map(({ name, club, position, goals }) => ({ name, club, position, goals })))
      renderedIdentities.push(...renderedScorers().map(({ name, club }) => `${name}\u0000${club}`))

      if (page < pageCount - 1) {
        if (page === 0) {
          next.focus()
          await user.keyboard('{Enter}')
        } else {
          await user.click(next)
        }
        expect(previous).toBeEnabled()
      }
    }

    expect(pagination).toHaveTextContent('301–305 de 305')
    expect(pagination).toHaveTextContent('Página 16 de 16')
    expect(scorerList.querySelectorAll('.scorer-item')).toHaveLength(5)
    expect(next).toBeDisabled()
    expect(renderedIdentities).toEqual(scorers.map(({ name, club }) => `${name}\u0000${club}`))
    expect(new Set(renderedIdentities).size).toBe(scorers.length)

    previous.focus()
    await user.keyboard('{Enter}')
    expect(pagination).toHaveTextContent('281–300 de 305')
    expect(pagination).toHaveTextContent('Página 15 de 16')
    expect(next).toBeEnabled()
  })

  it('identifica as fontes oficiais e a conferência secundária', () => {
    render(<App />)

    for (const cbfLink of screen.getAllByRole('link', { name: /CBF/ })) {
      expect(cbfLink).toHaveAttribute(
        'href',
        'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026',
      )
    }
    expect(screen.getByRole('link', { name: /ESPN · Consulta externa/ })).toHaveAttribute(
      'href',
      'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols',
    )
  })
})
