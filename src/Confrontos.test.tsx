import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NextRoundPanel } from './NextRoundPanel'
import { HeadToHeadPanel } from './HeadToHeadPanel'
import { TeamAnalysisPanel } from './TeamAnalysisPanel'
import { ProjectionProvider } from './ProjectionContext'
import { currentClubs, remainingFixtures } from './projectionData'
import { matchProbabilities } from './matchProbabilities'
import { getHeadToHeadSummary } from './seasonStats'

describe('painel da próxima rodada', () => {
  it('abre na menor rodada pendente com λ e probabilidades por jogo', () => {
    render(<NextRoundPanel />)
    // A menor rodada pendente: '21 adiado' tem 1 jogo (ordenação por número)
    const select = screen.getByRole('combobox', { name: 'Selecionar rodada pendente' })
    expect(select).toHaveValue('21 adiado')
    expect(within(select).getByRole('option', { name: /Rodada 21 \(adiado\) · 1 jogos?/ })).toBeInTheDocument()

    const matches = screen.getAllByRole('article')
    expect(matches).toHaveLength(1)
    const match = matches[0]!
    // λ explícito para os dois lados
    expect(within(match).getAllByText(/^λ /)).toHaveLength(2)
    // Barra com rótulo acessível contendo as três probabilidades
    const fixture = remainingFixtures.find(({ round }) => round === '21 adiado')!
    const { probabilities } = matchProbabilities(fixture.home, fixture.away)
    const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    expect(within(match).getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining(percent.format(probabilities[0])))
  })

  it('troca de rodada e mostra os 10 jogos da rodada 35', async () => {
    const user = userEvent.setup()
    render(<NextRoundPanel />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Selecionar rodada pendente' }), '35')
    expect(screen.getAllByRole('article')).toHaveLength(10)
    expect(screen.getAllByRole('img')).toHaveLength(10)
    // Cada artigo tem os dois λ e a nota de metodologia segue no painel
    for (const match of screen.getAllByRole('article')) {
      expect(within(match).getAllByText(/^λ /)).toHaveLength(2)
    }
    expect(screen.getByText(/não são previsões de placar nem odds/)).toBeInTheDocument()
  })

  it('soma das probabilidades de resultado fecha em 1 em todos os jogos da rodada aberta', () => {
    render(<NextRoundPanel />)
    for (const fixture of remainingFixtures) {
      const { probabilities } = matchProbabilities(fixture.home, fixture.away)
      const sum = probabilities.reduce((total, value) => total + value, 0)
      expect(sum).toBeCloseTo(1, 12)
    }
  })
})

describe('painel de confronto direto', () => {
  it('mostra barra de retrospecto, timeline e filtros de período para Flamengo × Palmeiras', async () => {
    const user = userEvent.setup()
    render(<HeadToHeadPanel />)
    const summary = getHeadToHeadSummary('flamengo', 'palmeiras')

    // Barra com contagens somadas de todos os encontros
    const bar = screen.getByRole('img', { name: /Retrospecto direto: Vitórias de Flamengo/ })
    expect(bar).toBeInTheDocument()

    const timeline = screen.getByRole('list', { name: /Timeline de encontros entre Flamengo e Palmeiras/ })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(summary.matches.length)
    // O encontro 2026 Flamengo 0–3 Palmeiras está na timeline com badge de derrota
    const meeting2026 = within(timeline).getAllByRole('listitem').find((item) => item.textContent?.includes('Flamengo') && item.textContent?.includes('0–3'))!
    expect(meeting2026).toHaveTextContent('D')
    expect(within(timeline).getAllByRole('listitem').filter((item) => item.textContent?.includes('Palmeiras')).length).toBeGreaterThan(0)

    // Presets de período: barra e resumo respondem ao filtro (default desde 2012)
    const summaryBox = document.querySelector('.h2h-summary')!
    expect(summaryBox.textContent).toContain('Período 2012–2026: 27 encontros')
    await user.click(screen.getByRole('button', { name: 'Temporada 2026' }))
    expect(document.querySelector('.h2h-summary')!.textContent).toContain('Período 2026–2026: 1 encontro · gols 0–3 (Flamengo primeiro)')
    const bar2026 = screen.getByRole('img', { name: /Retrospecto direto: Vitórias de Flamengo 0, Empates 0, Vitórias de Palmeiras 1/ })
    expect(bar2026).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desde 2012' }))
    expect(document.querySelector('.h2h-summary')!.textContent).toContain('Período 2012–2026')


    // Próximo confronto entre os dois: rodada 36 (palmeiras × flamengo)
    expect(screen.getByText(/Próximo confronto no calendário/)).toBeInTheDocument()
    expect(screen.getByText(/Rodada 36/)).toBeInTheDocument()
  })

  it('exibe estado vazio quando os dois selects têm o mesmo clube', async () => {
    const user = userEvent.setup()
    render(<HeadToHeadPanel />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube B do confronto' }), 'flamengo')
    expect(screen.getByText('Escolha dois clubes distintos')).toBeInTheDocument()
  })

  it('troca o par e recalcula a timeline', async () => {
    const user = userEvent.setup()
    render(<HeadToHeadPanel />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube A do confronto' }), 'gremio')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube B do confronto' }), 'internacional')
    const summary = getHeadToHeadSummary('gremio', 'internacional')
    const timeline = screen.getByRole('list', { name: /Timeline de encontros entre Grêmio e Internacional/ })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(summary.matches.length)
    expect(screen.getByRole('heading', { name: 'Grêmio × Internacional' })).toBeInTheDocument()
  })
})

describe('análise por clube', () => {
  it('abre no Grêmio com forma, sequência, mando e próximos jogos', () => {
    render(<ProjectionProvider><TeamAnalysisPanel /></ProjectionProvider>)
    expect(screen.getByRole('heading', { name: 'Como está e para onde vai' })).toBeInTheDocument()
    // KPI de posição/pontos do snapshot
    expect(screen.getByText(/Posição e pontos no corte/)).toBeInTheDocument()
    // Forma recente com 5 dots
    expect(screen.getByText(/Últimos 5 jogos de Grêmio/)).toBeInTheDocument()
    expect(screen.getByText(/Calendário de Grêmio/)).toBeInTheDocument()
    // Casa/fora
    expect(screen.getByText('Como mandante')).toBeInTheDocument()
    expect(screen.getByText('Como visitante')).toBeInTheDocument()
    // Card de projeção degradado (sem Worker no jsdom)
    expect(screen.getByText(/Projeção indisponível|Projeção em cálculo/)).toBeInTheDocument()
  })

  it('troca o clube e atualiza forma, projeção e calendário', async () => {
    const user = userEvent.setup()
    render(<ProjectionProvider><TeamAnalysisPanel /></ProjectionProvider>)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube para análise individual' }), 'flamengo')
    expect(screen.getByText(/Últimos 5 jogos de Flamengo/)).toBeInTheDocument()
    expect(screen.getByText(/Calendário de Flamengo/)).toBeInTheDocument()
    const flamengo = currentClubs.find(({ id }) => id === 'flamengo')!
    expect(screen.getByText(`${flamengo.position}º · ${flamengo.points} pts`)).toBeInTheDocument()
  })
})
