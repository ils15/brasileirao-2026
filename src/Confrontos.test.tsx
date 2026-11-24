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
    // Menor rodada pendente do snapshot vigente, derivada dos dados (hoje: 35).
    const pendingRounds = [...new Set(remainingFixtures.map(({ round }) => round))].sort(
      (left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10),
    )
    const firstRound = pendingRounds[0]!
    const firstRoundFixtures = remainingFixtures.filter(({ round }) => round === firstRound)
    const select = screen.getByRole('combobox', { name: 'Selecionar rodada pendente' })
    expect(select).toHaveValue(firstRound)
    expect(within(select).getByRole('option', { name: new RegExp(`Rodada ${firstRound} · ${firstRoundFixtures.length} jogos?`) })).toBeInTheDocument()

    const matches = screen.getAllByRole('article')
    expect(matches).toHaveLength(firstRoundFixtures.length)
    const match = matches[0]!
    // λ explícito para os dois lados
    expect(within(match).getAllByText(/^λ /)).toHaveLength(2)
    // Barra com rótulo acessível contendo as três probabilidades
    const fixture = firstRoundFixtures[0]!
    const { probabilities } = matchProbabilities(fixture.home, fixture.away)
    const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    expect(within(match).getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining(percent.format(probabilities[0])))
  })

  it('troca de rodada e mostra os jogos da rodada pendente escolhida', async () => {
    const user = userEvent.setup()
    render(<NextRoundPanel />)
    // Rodada-alvo derivada do pacote: a última pendente, diferente da inicial
    // que o painel abre sozinho.
    const rounds = [...new Set(remainingFixtures.map(({ round }) => round))].sort(
      (left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10) || left.localeCompare(right),
    )
    const targetRound = rounds[rounds.length - 1]!
    const select = screen.getByRole('combobox', { name: 'Selecionar rodada pendente' })
    await user.selectOptions(select, targetRound)
    expect(select).toHaveValue(targetRound)
    const targetFixtures = remainingFixtures.filter(({ round }) => round === targetRound)
    expect(screen.getAllByRole('article')).toHaveLength(targetFixtures.length)
    expect(screen.getAllByRole('img')).toHaveLength(targetFixtures.length)
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
    const nameOf = (id: string): string => currentClubs.find(({ id: clubId }) => clubId === id)!.club
    // Agregado H/E/F e gols derivados dos encontros do período: os números
    // acompanham o pacote em vez de cravar contadores de temporada.
    const outcomeOf = (matches: typeof summary.matches) => {
      const total = { winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0 }
      for (const match of matches) {
        const scoredA = match.home === 'flamengo' ? match.homeGoals : match.awayGoals
        const scoredB = match.home === 'palmeiras' ? match.homeGoals : match.awayGoals
        if (scoredA > scoredB) total.winsA += 1
        else if (scoredA === scoredB) total.draws += 1
        else total.winsB += 1
        total.goalsA += scoredA
        total.goalsB += scoredB
      }
      return { ...total, matches: matches.length }
    }
    const barLabel = (outcome: ReturnType<typeof outcomeOf>): string =>
      `Retrospecto direto: Vitórias de Flamengo ${outcome.winsA}, Empates ${outcome.draws}, Vitórias de Palmeiras ${outcome.winsB}`
    const periodText = (from: number, to: number): string => {
      const outcome = outcomeOf(summary.matches.filter(({ seasonYear }) => seasonYear >= from && seasonYear <= to))
      return `Período ${from}–${to}: ${outcome.matches === 1 ? '1 encontro' : `${outcome.matches} encontros`} · gols ${outcome.goalsA}–${outcome.goalsB} (Flamengo primeiro)`
    }
    const from2012 = summary.matches.filter(({ seasonYear }) => seasonYear >= 2012 && seasonYear <= 2026)
    const meetings2026 = summary.matches.filter(({ seasonYear }) => seasonYear === 2026)

    // Barra com contagens somadas de todos os encontros do período
    expect(screen.getByRole('img', { name: barLabel(outcomeOf(from2012)) })).toBeInTheDocument()

    const timeline = screen.getByRole('list', { name: /Timeline de encontros entre Flamengo e Palmeiras/ })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(from2012.length)

    // Todo encontro de 2026 aparece na timeline com o badge V/E/D do Flamengo
    // (clube A): o badge é conferido contra o placar real de cada encontro.
    expect(meetings2026.length).toBeGreaterThan(0)
    for (const meeting of meetings2026) {
      const item = within(timeline).getAllByRole('listitem').find((entry) =>
        entry.textContent?.includes(String(meeting.seasonYear))
        && entry.textContent?.includes(`${meeting.homeGoals}–${meeting.awayGoals}`)
        && entry.textContent?.includes(nameOf(meeting.home))
        && entry.textContent?.includes(nameOf(meeting.away)))
      expect(item).toBeDefined()
      const scoredA = meeting.home === 'flamengo' ? meeting.homeGoals : meeting.awayGoals
      const scoredB = meeting.home === 'palmeiras' ? meeting.homeGoals : meeting.awayGoals
      expect(item!.querySelector('.meeting-badge')).toHaveTextContent(scoredA > scoredB ? 'V' : scoredA === scoredB ? 'E' : 'D')
    }

    // Presets de período: barra e resumo respondem ao filtro (default desde 2012)
    expect(document.querySelector('.h2h-summary')!.textContent).toContain(periodText(2012, 2026))
    await user.click(screen.getByRole('button', { name: 'Temporada 2026' }))
    expect(document.querySelector('.h2h-summary')!.textContent).toContain(periodText(2026, 2026))
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(meetings2026.length)
    expect(screen.getByRole('img', { name: barLabel(outcomeOf(meetings2026)) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desde 2012' }))
    expect(document.querySelector('.h2h-summary')!.textContent).toContain(periodText(2012, 2026))
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(from2012.length)

    // Próximo confronto: seleciona o par do primeiro jogo pendente do
    // calendário e o painel precisa anunciar a rodada desse jogo.
    const nextFixture = remainingFixtures[0]!
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube A do confronto' }), nextFixture.home)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clube B do confronto' }), nextFixture.away)
    const nextMeeting = screen.getByText(/Próximo confronto no calendário/).closest('.h2h-next-meeting')
    expect(nextMeeting).not.toBeNull()
    expect(nextMeeting!.textContent).toContain(`Rodada ${nextFixture.round}`)
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
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(summary.matches.filter(({ seasonYear }) => seasonYear >= 2012 && seasonYear <= 2026).length)
    expect(screen.getByRole('heading', { name: 'Grêmio × Internacional' })).toBeInTheDocument()
  })
})

describe('análise por clube', () => {
  it('abre no Grêmio com forma, sequência, mando e próximos jogos', async () => {
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
    // Card de projeção degradado (sem Worker no jsdom): falha anunciada com recuperação.
    // O caminho rápido tenta `projecoes.json` antes do worker, então o status só
    // vira erro depois do fetch rejeitado — a asserção espera em vez de exigir
    // render síncrono.
    const projectionCard = await screen.findByRole('alert')
    expect(projectionCard).toHaveTextContent(/Projeção indisponível|Projeção em cálculo/)
    expect(projectionCard).toHaveTextContent('Não foi possível executar as simulações neste navegador.')
    expect(within(projectionCard).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
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
