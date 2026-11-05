import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsTable } from './ResultsTable'
import { AuditPanel } from './AuditPanel'

describe('tabela de resultados 2026', () => {
  it('lista os 332 resultados paginados com contagem visível', () => {
    render(<ResultsTable />)
    const region = screen.getByRole('region', { name: /Resultados por data/ })
    // 25 por página + cabeçalho
    expect(within(region).getAllByRole('row')).toHaveLength(26)
    expect(screen.getByText('Página 1 de 14 · 1–25 de 332 linhas')).toBeInTheDocument()
    expect(screen.getByText('332 resultados')).toBeInTheDocument()
  })

  it('pagina com Anterior/Próxima mantendo 25 linhas por página', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(screen.getByText('Página 2 de 14 · 26–50 de 332 linhas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('Página 1 de 14 · 1–25 de 332 linhas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('filtra por clube combinando mando e visita', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por clube' }), 'flamengo')
    expect(screen.getByText(/de 332 resultados/)).toBeInTheDocument()
    // Flamengo jogou 33 partidas até o corte
    expect(screen.getByText('33 de 332 resultados')).toBeInTheDocument()
    const table = screen.getByRole('region', { name: /Resultados por data/ })
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(row.textContent).toMatch(/flamengo/)
    }
  })

  it('filtra por fonte ESPN mostrando apenas os dois placares complementares', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por fonte' }), 'espn')
    expect(screen.getByText('2 de 332 resultados')).toBeInTheDocument()
    const table = screen.getByRole('region', { name: /Resultados por data/ })
    expect(within(table).getByText(/chapecoense/i)).toBeInTheDocument()
    expect(within(table).getByText(/internacional/i)).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })

  it('filtra por data inicial e limpa filtros de volta à base completa', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.type(screen.getByLabelText('Filtrar resultados a partir da data'), '2026-11-01')
    // Novembro até o corte: 1 jogo Football-Data (02/11) + 2 ESPN (03–04/11 UTC)
    expect(screen.getByText('3 de 332 resultados')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByText('332 resultados')).toBeInTheDocument()
  })

  it('exibe estado vazio informativo quando o filtro não casa nada', async () => {
    const user = userEvent.setup()
    render(<ResultsTable />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por clube' }), 'flamengo')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar resultados por fonte' }), 'espn')
    // Flamengo não tem resultado ESPN na base
    const emptyState = screen.getByText('Nenhum resultado para estes filtros').closest('div[class="empty-state-card"]')! as HTMLElement
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
    expect(screen.getByRole('columnheader', { name: /Placar/ })).toHaveAttribute('aria-sort', 'ascending')
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

  it('lista as fontes com hash SHA-256 e horário de captura', () => {
    render(<AuditPanel />)
    const block = screen.getByRole('heading', { name: 'Fontes e captura' }).closest('section')!
    expect(within(block).getAllByText(/SHA-256/)).toHaveLength(4)
    expect(within(block).getByText('2026-11-04 16:41:42-03:00')).toBeInTheDocument()
  })

  it('valida a temporada 2026 e as cinco temporadas históricas sem divergências', () => {
    render(<AuditPanel />)
    const table = screen.getByRole('region', { name: 'Status das validações de dados' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(7)
    for (const row of rows.slice(1)) {
      expect(within(row).getByText('ok')).toBeInTheDocument()
    }
    expect(within(table).getByText(/332 jogos disputados · 48 pendentes/)).toBeInTheDocument()
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
    expect(screen.getByText('Classificação oficial no corte (20 clubes)')).toBeInTheDocument()
    expect(screen.getByText('Calendário restante (48 jogos)')).toBeInTheDocument()
    expect(screen.getAllByText('332 linhas').length).toBeGreaterThan(0)
    expect(screen.getByText('48 linhas')).toBeInTheDocument()
    expect(screen.getByText('20 linhas')).toBeInTheDocument()
  })
})
