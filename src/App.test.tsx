import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('painel do Brasileirão 2026', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
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

  it('separa a navegação nas cinco áreas de consulta do painel', () => {
    render(<App />)

    const areaNavigation = screen.getByRole('navigation', { name: 'Navegação por área' })
    expect(within(areaNavigation).getByRole('link', { name: 'Por time' })).toHaveAttribute('href', '#probabilidades-time')
    expect(within(areaNavigation).getByRole('link', { name: 'Por pontuação' })).toHaveAttribute('href', '#por-pontuacao')
    expect(within(areaNavigation).getByRole('link', { name: 'Classificação' })).toHaveAttribute('href', '#classificacao')
    expect(within(areaNavigation).getByRole('link', { name: 'Calendário' })).toHaveAttribute('href', '#calendario')
    expect(within(areaNavigation).getByRole('link', { name: 'Estatísticas/Metodologia' })).toHaveAttribute('href', '#estatisticas')
    for (const link of within(areaNavigation).getAllByRole('link')) {
      expect(document.querySelector(link.getAttribute('href') ?? '')).toBeInTheDocument()
    }
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
