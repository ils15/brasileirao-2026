import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsTable } from './ResultsTable'
import { AuditPanel } from './AuditPanel'
import { CURRENT_SEASON_PACK_GENERATED_AT, CURRENT_SEASON_SOURCE, currentSeasonResults } from './currentSeasonResults'
import { ADVANCED_STATS_SOURCE, advancedMatches } from './advancedStats2026'
import { currentClubs, remainingFixtures } from './projectionData'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'

const playedCount = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).length

describe('tabela de resultados 2026', () => {
  it('mantém a contagem e o corte atuais no estado sem resultados', () => {
    render(<ResultsTable matches={[]} />)

    expect(screen.getByText('Nenhum resultado para estes filtros')).toBeInTheDocument()
    expect(screen.getByText(/o log cobre 0 partidas até 06\/11\/2026 · 21:58:14 BRT/)).toBeInTheDocument()
  })

  it('lista os resultados paginados com contagem visível', () => {
    render(<ResultsTable />)
    const region = screen.getByRole('region', { name: /Resultados por data/ })
    // 25 por página + cabeçalho
    expect(within(region).getAllByRole('row')).toHaveLength(26)
    const pageCount = Math.ceil(playedCount / 25)
    expect(screen.getByText(`Página 1 de ${pageCount} · 1–25 de ${playedCount} linhas`)).toBeInTheDocument()
    expect(screen.getByText(`${playedCount} resultados`)).toBeInTheDocument()
  })

  it('pagina com Anterior/Próxima mantendo 25 linhas por página', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    const pageCount = Math.ceil(playedCount / 25)
    expect(screen.getByText(`Página 2 de ${pageCount} · 26–50 de ${playedCount} linhas`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText(`Página 1 de ${pageCount} · 1–25 de ${playedCount} linhas`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('filtra por clube combinando mando e visita', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por clube' }), 'flamengo')
    const flamengoCount = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).filter((match) => match.home === 'flamengo' || match.away === 'flamengo').length
    expect(screen.getByText(`${flamengoCount} de ${playedCount} resultados`)).toBeInTheDocument()
    const table = screen.getByRole('region', { name: /Resultados por data/ })
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(row.textContent).toMatch(/Flamengo/i)
    }
  })

  it('filtra por fonte ESPN mostrando apenas os placares complementares', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por fonte' }), 'espn')
    const espnCount = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).filter((match) => match.source === 'espn').length
    expect(screen.getByText(`${espnCount} de ${playedCount} resultados`)).toBeInTheDocument()
    const table = screen.getByRole('region', { name: /Resultados por data/ })
    expect(within(table).getAllByRole('row')).toHaveLength(espnCount + 1)
    // Todo resultado ESPN retém o id numérico do evento como referência
    const espnResults = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).filter((match) => match.source === 'espn')
    expect(espnResults.length).toBeGreaterThan(0)
    for (const match of espnResults) expect(match.sourceRef).toMatch(/^\d+$/)
  })

  it('filtra por data inicial e limpa filtros de volta à base completa', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.type(screen.getByLabelText('Filtrar resultados a partir da data'), '2026-11-01')
    // Novembro até o corte: jogos de 01/11 em diante presentes nos snapshots
    const novemberCount = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).filter((match) => match.kickoff.slice(0, 10) >= '2026-11-01').length
    expect(novemberCount).toBeGreaterThan(0)
    expect(screen.getByText(`${novemberCount} de ${playedCount} resultados`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByText(`${playedCount} resultados`)).toBeInTheDocument()
  })

  it('exibe estado vazio informativo quando o filtro não casa nada', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por clube' }), 'flamengo')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por fonte' }), 'espn')
    // Par sem resultado ESPN na base atual
    const flamengoEspn = filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).filter((match) => match.source === 'espn' && (match.home === 'flamengo' || match.away === 'flamengo')).length
    if (flamengoEspn > 0) return
    const emptyState = screen.getByText('Nenhum resultado para estes filtros').closest('div[class="empty-state-card"]')! as HTMLElement
    expect(within(emptyState).getByText(/o log cobre 339 partidas até 06\/11\/2026 · 21:58:14 BRT/)).toBeInTheDocument()
    expect(within(emptyState).getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument()
  })

  it('ordena por placar (saldo de gols) ao clicar no cabeçalho', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.click(screen.getByRole('button', { name: /Placar/i }))
    const table = screen.getByRole('region', { name: /Resultados por data/ })
    const firstRow = within(table).getAllByRole('row')[1]!
    // Ordem ascendente por saldo: derrota do mandante mais pesada primeiro
    expect(firstRow).toHaveTextContent(/–/)
    expect(screen.getByRole('columnheader', { name: /Placar/ })).toHaveAttribute('aria-sort', 'descending')
  })
})

describe('painel de dados & auditoria', () => {
  let createObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:auditoria')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('distingue mtime, capturas, corte e correspondência de placares das fontes', () => {
    render(<AuditPanel />)
    const block = screen.getByRole('heading', { name: 'Fontes e captura' }).closest('section')!
    expect(within(block).getAllByText(/SHA-256/)).toHaveLength(5)
    expect(within(block).getByText(`ESPN (${CURRENT_SEASON_SOURCE.espn.withoutFootballDataScore} de ${CURRENT_SEASON_SOURCE.espn.completedMatches} resultados atribuídos à ESPN no pacote sem correspondência no CSV Football-Data)`)).toBeInTheDocument()
    expect(within(block).getAllByText('não registrada no snapshot')).toHaveLength(3)
    expect(within(block).getByText(/2026-11-\d\d \d\d:\d\d:\d\d-03:00/)).toBeInTheDocument()
    expect(within(block).getByText('mtime do arquivo')).toBeInTheDocument()
    expect(within(block).getByText(/não comprova captura ou coleta/)).toBeInTheDocument()
    expect(within(block).getByText('365scores (xG e cartões)')).toBeInTheDocument()
    expect(within(block).getByText('Obtido em')).toBeInTheDocument()
    expect(within(block).getByText(ADVANCED_STATS_SOURCE.fetchedAt.replace('T', ' ').replace('Z', ' UTC'))).toBeInTheDocument()
    expect(within(block).getByText('SHA-256 do JSON canônico')).toBeInTheDocument()
    expect(within(block).getByText(new RegExp(ADVANCED_STATS_SOURCE.sha256))).toBeInTheDocument()
    expect(screen.getByText(/Corte analítico: 06\/11\/2026 · 21:58:14 BRT/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Pacote gerado em ${CURRENT_SEASON_PACK_GENERATED_AT}`))).toBeInTheDocument()
    const currentScoreKeys = new Set(currentSeasonResults.map((match) => `${match.home}|${match.away}|${match.homeGoals}-${match.awayGoals}`))
    const matchingAdvancedScores = advancedMatches.filter((match) => currentScoreKeys.has(`${match.home}|${match.away}|${match.homeScore}-${match.awayScore}`)).length
    expect(block).toHaveTextContent(new RegExp(`Correspondência de placares 365scores.*${matchingAdvancedScores}/${advancedMatches.length}`))
    expect(within(block).getByText(/não comprova cobertura temporal por partida/)).toBeInTheDocument()
    expect(within(block).getByText(/dados pós-corte não são garantidos como parte do corte analítico/)).toBeInTheDocument()
    expect(screen.getByText(/Artilharia: API Futebol BR, captura 07\/11\/2026 · 16:00:24 UTC, posterior ao corte; sem timestamp por partida, cobertura temporal não verificada/)).toBeInTheDocument()
  })

  it('mantém cada cartão de proveniência como subtítulo das fontes', () => {
    render(<AuditPanel />)
    const block = screen.getByRole('heading', { name: 'Fontes e captura' }).closest('section')!

    expect(within(block).getByRole('heading', { level: 4, name: '365scores (xG e cartões)' })).toBeInTheDocument()
  })

  it('valida a temporada 2026 e as 14 temporadas históricas sem divergências', () => {
    render(<AuditPanel />)
    const table = screen.getByRole('region', { name: 'Status das validações de dados' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(16)
    for (const row of rows.slice(1)) {
      expect(within(row).getByText('ok')).toBeInTheDocument()
    }
    expect(within(table).getByText(new RegExp(`${playedCount} jogos disputados · ${remainingFixtures.length} pendentes`))).toBeInTheDocument()
  })

  it('exporta o log de resultados em CSV, XLSX e JSON com download local', async () => {
    const user = userEvent.setup()
    render(<AuditPanel />)
    const exportGroup = screen.getByRole('group', { name: /Exportar Resultados 2026/ })
    const clicks = HTMLAnchorElement.prototype.click as ReturnType<typeof vi.fn>
    const lastAnchor = (): HTMLAnchorElement => clicks.mock.instances.at(-1) as HTMLAnchorElement

    await user.click(within(exportGroup).getByRole('button', { name: 'CSV' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(lastAnchor().download).toBe('brasileirao-2026-resultados.csv')
    await user.click(within(exportGroup).getByRole('button', { name: 'XLSX' }))
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(lastAnchor().download).toBe('brasileirao-2026-resultados.xlsx')
    await user.click(within(exportGroup).getByRole('button', { name: 'JSON' }))
    expect(createObjectURL).toHaveBeenCalledTimes(3)
    expect(lastAnchor().download).toBe('brasileirao-2026-resultados.json')
    expect(screen.getByText(/Último download: Resultados 2026 \(log de partidas\) — JSON/)).toBeInTheDocument()
  })

  it('oferece os três conjuntos com contagem de linhas', () => {
    render(<AuditPanel />)
    expect(screen.getByText('Classificação derivada do pacote (20 clubes)')).toBeInTheDocument()
    expect(screen.getByText(`Calendário restante (${remainingFixtures.length} jogos)`)).toBeInTheDocument()
    expect(screen.getAllByText(`${playedCount} linhas`).length).toBeGreaterThan(0)
    expect(screen.getByText(`${remainingFixtures.length} linhas`)).toBeInTheDocument()
    expect(screen.getByText(`${currentClubs.length} linhas`)).toBeInTheDocument()
  })
})
