import { useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { attackDefenseLeaders, currentStreaks, lastNRounds, positionByRound, standingsFromResults, type StandingsRow } from './rounds'
import { espnLogoUrl } from './projectionData'
import { useTableSort, type SortableColumn } from './useTableSort'
import { ZONES } from './projectionConfig'
import { getZoneLabel } from './data'

/**
 * Aba Classificações: as vistas clássicas de análise (geral, últimas rodadas,
 * mandante, visitante, turno, returno) mais a evolução da posição por rodada
 * e as sequências vigentes — separadas em sub-abas para não concentrar tudo
 * em um bloco único.
 */

const FULL_COLUMNS: SortableColumn<StandingsRow>[] = [
  { id: 'position', header: 'Pos', accessor: ({ position }) => position, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'points', header: 'Pts', accessor: ({ points }) => points, numeric: true },
  { id: 'played', header: 'J', accessor: ({ played }) => played, numeric: true },
  { id: 'wins', header: 'V', accessor: ({ wins }) => wins, numeric: true },
  { id: 'draws', header: 'E', accessor: ({ draws }) => draws, numeric: true },
  { id: 'losses', header: 'D', accessor: ({ losses }) => losses, numeric: true },
  { id: 'goalsFor', header: 'GP', accessor: ({ goalsFor }) => goalsFor, numeric: true },
  { id: 'goalsAgainst', header: 'GC', accessor: ({ goalsAgainst }) => goalsAgainst, numeric: true },
  { id: 'goalDifference', header: 'SG', accessor: ({ goalDifference }) => goalDifference, numeric: true },
]

const SHORT_COLUMNS: SortableColumn<StandingsRow>[] = [
  { id: 'position', header: 'Pos', accessor: ({ position }) => position, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'points', header: 'Pts', accessor: ({ points }) => points, numeric: true },
  { id: 'played', header: 'J', accessor: ({ played }) => played, numeric: true },
  { id: 'goalDifference', header: 'SG', accessor: ({ goalDifference }) => goalDifference, numeric: true },
]

function zoneClass(position: number): string {
  if (position <= ZONES.libertadores.to) return 'qualification'
  if (position <= ZONES.sudamericana.to) return 'sudamericana'
  if (position >= ZONES.relegation.from) return 'relegation'
  return 'middle'
}

interface StandingsTableViewProps {
  rows: StandingsRow[]
  columns: SortableColumn<StandingsRow>[]
  initialSort: string
  caption: string
}

function StandingsTableView({ rows, columns, initialSort, caption }: StandingsTableViewProps): JSX.Element {
  const { sortedRows, toggleSort, ariaSort } = useTableSort(rows, columns, initialSort)
  const formatCell = (row: StandingsRow, key: string): string => {
    if (key === 'position') return String(row.position).padStart(2, '0')
    if (key === 'goalDifference') return row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference)
    return String(row[key as keyof StandingsRow])
  }
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="standings-view-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={ariaSort(column.id)}>
                <button type="button" className="sort-button" onClick={() => toggleSort(column.id)}>
                  {column.header}
                  <span className="sort-indicator" aria-hidden="true">{ariaSort(column.id) === 'ascending' ? ' ↑' : ariaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className={`standing-row standing-row--${zoneClass(row.position)}`}>
              {columns.map((column, index) => (
                index === 1
                  ? (
                    <th key={column.id} scope="row" className="club-cell">
                      {espnLogoUrl(row.id) && (
                        <img className="crest crest--xs" src={espnLogoUrl(row.id)} alt="" aria-hidden="true" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />
                      )}
                      <span className="club-cell-name">{row.club}</span>
                      <span className={`zone-tag zone-tag--${zoneClass(row.position)}`}>{getZoneLabel(row.position)}</span>
                    </th>
                  )
                  : <td key={column.id} className={column.id === 'points' ? 'numeric points-cell' : 'numeric games-cell'}>{formatCell(row, column.id)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CHART_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#ff7f0e', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94', '#f7b6d2', '#dbdb8d', '#9edae5', '#ad494a']

/**
 * Evolução da posição por rodada com seleção de foco: todos os clubes ficam
 * visíveis em traço fino, e os selecionados ganham traço grosso + rótulo.
 * Faixas de zona (Libertadores/rebaixamento) aparecem como fundo colorido.
 */
function PositionEvolutionChart(): JSX.Element {
  const evolution = useMemo(() => positionByRound(), [])
  const [focusedIds, setFocusedIds] = useState<string[]>(() => ['flamengo', 'palmeiras'])
  const width = 960
  const height = 640
  const padding = { top: 28, right: 130, bottom: 40, left: 46 }
  const stepX = (width - padding.left - padding.right) / Math.max(1, evolution.rounds.length - 1)
  const stepY = (height - padding.top - padding.bottom) / 19
  const labelFor = new Map(evolution.clubs.map(({ id, club }) => [id, club]))
  const positionAt = (position: number): number => padding.top + (position - 1) * stepY
  const xAt = (index: number): number => padding.left + index * stepX

  function toggleFocus(id: string): void {
    setFocusedIds((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id)
      return [...current, id]
    })
  }

  const zoneBands = [
    { from: ZONES.libertadores.from, to: ZONES.libertadores.to, className: 'evolution-band--top' },
    { from: ZONES.relegation.from, to: ZONES.relegation.to, className: 'evolution-band--bottom' },
  ]

  return (
    <figure className="evolution-figure">
      <div className="evolution-picker" role="group" aria-label="Selecionar clubes para destacar no gráfico">
        {evolution.clubs.map((club) => {
          const colorIndex = evolution.clubs.findIndex((entry) => entry.id === club.id)
          return (
            <button
              key={club.id}
              type="button"
              className={focusedIds.includes(club.id) ? 'evolution-chip is-selected' : 'evolution-chip'}
              aria-pressed={focusedIds.includes(club.id)}
              onClick={() => toggleFocus(club.id)}
            >
              <i className="evolution-swatch" style={{ background: CHART_COLORS[colorIndex % CHART_COLORS.length] }} aria-hidden="true" />
              {club.club}
            </button>
          )
        })}
      </div>
      <svg
        className="evolution-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Evolução da posição por rodada, da primeira à ${evolution.rounds.length}ª. Destacados: ${focusedIds.map((id) => labelFor.get(id) ?? id).join(', ') || 'nenhum clube'}. Faixa verde marca Libertadores ${ZONES.libertadores.detail}; faixa vermelha, rebaixamento ${ZONES.relegation.detail}.`}
      >
        {zoneBands.map((band) => (
          <rect key={band.className} x={padding.left} y={positionAt(band.from)} width={width - padding.left - padding.right} height={(band.to - band.from + 1) * stepY} className={`evolution-band ${band.className}`} />
        ))}
        {[1, 5, 6, 11, 12, 16, 17, 20].map((position) => (
          <g key={position}>
            <line x1={padding.left} x2={width - padding.right} y1={positionAt(position)} y2={positionAt(position)} className="evolution-grid" />
            <text x={padding.left - 8} y={positionAt(position) + 4} textAnchor="end" className="evolution-tick">{position}</text>
          </g>
        ))}
        {evolution.rounds.map((round, index) => (
          <text key={round} x={xAt(index)} y={height - padding.bottom + 22} textAnchor="middle" className="evolution-tick">{round}</text>
        ))}
        {evolution.clubs.map((club) => {
          const clubIndex = evolution.clubs.findIndex((entry) => entry.id === club.id)
          const color = CHART_COLORS[clubIndex % CHART_COLORS.length]!
          const isFocused = focusedIds.includes(club.id)
          const points = club.positions.map((position, index) => `${xAt(index)},${positionAt(position)}`).join(' ')
          return (
            <g key={club.id} className={isFocused ? 'evolution-club is-focused' : 'evolution-club'}>
              <polyline className="evolution-line" stroke={color} strokeWidth={isFocused ? 3.2 : 1} opacity={isFocused ? 1 : 0.18} points={points} />
              {isFocused && (
                <>
                  <circle cx={xAt(club.positions.length - 1)} cy={positionAt(club.positions.at(-1)!)} r="4" fill={color} />
                  <text x={xAt(club.positions.length - 1) + 8} y={positionAt(club.positions.at(-1)!) + 4} className="evolution-label" fill={color}>{labelFor.get(club.id)}</text>
                </>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption>
        Posição ao fim de cada rodada com jogos (adiados podem deixar rodadas parciais; o último ponto coincide com a tabela derivada do pacote).
        Clique nos chips para destacar clubes; as 20 linhas ficam de fundo em traço fino.
      </figcaption>
    </figure>
  )
}

function StreaksAndExtremesView(): JSX.Element {
  const streaks = useMemo(() => currentStreaks(), [])
  const extremes = useMemo(() => attackDefenseLeaders(), [])
  const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="streaks-view">
      <div className="extremes-strip" aria-label="Líderes de ataque e defesa por jogo">
        <div className="kpi-card"><strong className="kpi-value">{decimal.format(extremes.attack.goalsPerMatch)}</strong><span className="kpi-label">Melhor ataque · {extremes.attack.club} (gols/jogo)</span></div>
        <div className="kpi-card"><strong className="kpi-value">{decimal.format(extremes.defense.concededPerMatch)}</strong><span className="kpi-label">Melhor defesa · {extremes.defense.club} (sofridos/jogo)</span></div>
      </div>
      <div className="table-scroll" role="region" aria-label="Sequências vigentes por clube" tabIndex={0}>
        <table className="standings-view-table">
          <thead><tr><th scope="col">CLUBE</th><th scope="col" className="numeric">VITÓRIAS SEGUIDAS</th><th scope="col" className="numeric">EMPATES SEGUIDOS</th><th scope="col" className="numeric">DERROTAS SEGUIDAS</th><th scope="col" className="numeric">INVICTO</th><th scope="col" className="numeric">SEM VITÓRIA</th></tr></thead>
          <tbody>
            {streaks.map((streak) => (
              <tr key={streak.id}>
                <th scope="row" className="club-cell"><span>{streak.club}</span></th>
                <td className="numeric games-cell">{streak.wins > 0 ? streak.wins : '—'}</td>
                <td className="numeric games-cell">{streak.draws > 0 ? streak.draws : '—'}</td>
                <td className="numeric games-cell">{streak.losses > 0 ? streak.losses : '—'}</td>
                <td className="numeric games-cell">{streak.unbeaten > 0 ? streak.unbeaten : '—'}</td>
                <td className="numeric games-cell">{streak.winless > 0 ? streak.winless : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">Sequências vigentes consideram todos os resultados até o corte em ordem cronológica; “—” indica sequência não ativa.</p>
    </div>
  )
}

const VIEW_IDS = ['geral', 'ultimas', 'mandante', 'visitante', 'turno', 'returno', 'evolucao', 'sequencias'] as const
type ViewId = (typeof VIEW_IDS)[number]

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'ultimas', label: 'Últimas 10 rodadas' },
  { id: 'mandante', label: 'Mandante' },
  { id: 'visitante', label: 'Visitante' },
  { id: 'turno', label: 'Turno (1º–19º)' },
  { id: 'returno', label: 'Returno (20º–38º)' },
  { id: 'evolucao', label: 'Evolução por rodada' },
  { id: 'sequencias', label: 'Sequências e extremos' },
]

export function StandingsViews(): JSX.Element {
  const [activeView, setActiveView] = useState<ViewId>('geral')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lastTenRounds = useMemo(() => lastNRounds(10), [])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const lastIndex = VIEWS.length - 1
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % VIEWS.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + VIEWS.length) % VIEWS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lastIndex
            : -1
    if (nextIndex < 0) return
    event.preventDefault()
    setActiveView(VIEWS[nextIndex]!.id)
    tabRefs.current[nextIndex]?.focus()
  }

  const generalLegend = (
    <div
      className="zone-legend"
      role="group"
      aria-label="Legenda das zonas da classificação"
      aria-describedby="standings-zone-legend-note"
    >
      <span><i className="legend-dot qualification" />Libertadores · {ZONES.libertadores.detail}</span>
      <span><i className="legend-dot sudamericana" />Sul-Americana · {ZONES.sudamericana.detail}</span>
      <span><i className="legend-dot middle" />Meio de tabela · {ZONES.middle.detail}</span>
      <span><i className="legend-dot relegation" />Rebaixamento · {ZONES.relegation.detail}</span>
      <p id="standings-zone-legend-note" className="zone-legend-note">
        * O asterisco indica o cenário G-6 adotado pelo painel; o 6º lugar depende das regras de redistribuição e da sobreposição de classificados.
      </p>
    </div>
  )
  const viewContent: Record<ViewId, JSX.Element> = {
    geral: <>{generalLegend}<StandingsTableView rows={standingsFromResults()} columns={FULL_COLUMNS} initialSort="position" caption="Classificação geral; role para rolagem horizontal em telas pequenas" /></>,
    ultimas: <StandingsTableView rows={standingsFromResults({ rounds: lastTenRounds })} columns={SHORT_COLUMNS} initialSort="points" caption={`Classificação nas últimas 10 rodadas completas (${lastTenRounds[0]}ª à ${lastTenRounds.at(-1)}ª)`} />,
    mandante: <StandingsTableView rows={standingsFromResults({ venue: 'home' })} columns={SHORT_COLUMNS} initialSort="points" caption="Classificação só com jogos como mandante" />,
    visitante: <StandingsTableView rows={standingsFromResults({ venue: 'away' })} columns={SHORT_COLUMNS} initialSort="points" caption="Classificação só jogos como visitante" />,
    turno: <StandingsTableView rows={standingsFromResults({ fromRound: 1, toRound: 19 })} columns={SHORT_COLUMNS} initialSort="points" caption="Classificação do turno (rodadas 1 a 19)" />,
    returno: <StandingsTableView rows={standingsFromResults({ fromRound: 20 })} columns={SHORT_COLUMNS} initialSort="points" caption="Classificação do returno (rodadas 20 em diante)" />,
    evolucao: <PositionEvolutionChart />,
    sequencias: <StreaksAndExtremesView />,
  }

  return (
    <section className="panel standings-views" aria-labelledby="standings-views-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">ANÁLISES DA TABELA</p><h2 id="standings-views-title">Classificações</h2></div>
        <span className="section-index">02 <span>/ TABELAS</span></span>
      </div>
      <p role="note" aria-label="Limitação do desempate pelo Art. 15 da CBF" className="tiebreaker-note">
        <strong>Art. 15 — norma oficial:</strong> pontos → vitórias → saldo de gols → gols pró → confronto direto → menos cartões vermelhos → menos cartões amarelos → sorteio. No H2H entre dois clubes, somam-se os pontos dos jogos de ida e volta e depois se compara o saldo; para três ou mais, H2H não se aplica. <strong>Nesta tabela:</strong> a ordem analítica é pontos → vitórias → saldo → gols pró → nome do clube; não aplica integralmente o Art. 15 nem representa uma classificação oficial da CBF. <strong>Limite temporal:</strong> o snapshot 365scores (07/11/2026 15:25 UTC) é posterior ao corte analítico 2026-11-07T00:58:14.422Z e não tem cobertura temporal por partida suficiente para confirmar o estado dos cartões naquele corte.
      </p>
      <div className="subtabs" role="tablist" aria-label="Vistas da classificação">
        {VIEWS.map((view, index) => (
          <button
            key={view.id}
            ref={(element) => { tabRefs.current[index] = element }}
            className={activeView === view.id ? 'subtab is-selected' : 'subtab'}
            id={`vista-${view.id}`}
            role="tab"
            type="button"
            aria-selected={activeView === view.id}
            aria-controls={`painel-vista-${view.id}`}
            tabIndex={activeView === view.id ? 0 : -1}
            onClick={() => setActiveView(view.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >{view.label}</button>
        ))}
      </div>
      <div id={`painel-vista-${activeView}`} role="tabpanel" aria-labelledby={`vista-${activeView}`}>
        {viewContent[activeView]}
      </div>
      <p className="table-note">Todas as vistas agregam os resultados até o corte. Nas vistas parciais, clubes com jogos adiados podem ter um jogo a menos.</p>
    </section>
  )
}
