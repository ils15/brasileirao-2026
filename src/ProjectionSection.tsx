import { useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { SIMULATION_COUNT, SIMULATION_SEED } from './projectionConfig'
import type { ClubProbability, ProjectionResult } from './projection'
import { useProjection, type ProjectionStatus } from './ProjectionContext'
import { seasonFacts, cutoffLabel } from './seasonFacts'
import { useTableSort, type SortableColumn } from './useTableSort'
import { buildXlsx, downloadFile, toCSV, toJson } from './exporters'

interface ProjectionPanelProps {
  result: ProjectionResult | null
  status: ProjectionStatus
  onRetry: () => void
}

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })
const pointCurveOutcomes = [
  { id: 'title', label: 'Título · 1º' },
  { id: 'libertadores', label: 'Libertadores · 1º–5º' },
  { id: 'sudamericana', label: 'Sul-Americana · 6º–11º' },
  { id: 'middle', label: 'Meio · 12º–16º' },
  { id: 'relegation', label: 'Rebaixamento · 17º–20º' },
] as const

interface MagicRow {
  points: number
  title: number
  libertadores: number
  sudamericana: number
  middle: number
  relegation: number
  relegationLower: number
  relegationUpper: number
  lowSample: boolean
}

const MAGIC_DESTINIES = [
  { id: 'relegation', label: 'Rebaixamento', swatch: 'zone-bar--relegation' },
  { id: 'libertadores', label: 'Libertadores', swatch: 'zone-bar--libertadores' },
  { id: 'sudamericana', label: 'Sul-Americana', swatch: 'zone-bar--sudamericana' },
  { id: 'title', label: 'Título', swatch: 'zone-bar--title' },
] as const

type MagicDestiny = (typeof MAGIC_DESTINIES)[number]['id']

/**
 * Curva P(destino | pontuação exata) em formato "linha do destino": o usuário
 * escolhe o destino e a leitura inteira (KPIs, barra, destaque) passa a
 * responder a ele. Todas as colunas permanecem para transparência.
 */
function MagicPointsPanel({ result }: { result: ProjectionResult }): JSX.Element {
  const [destiny, setDestiny] = useState<MagicDestiny>('relegation')
  const rows = useMemo<MagicRow[]>(() => {
    const byPoints = new Map<number, MagicRow>()
    for (const row of result.pointCurve.rows) {
      const entry = byPoints.get(row.points) ?? {
        points: row.points, title: 0, libertadores: 0, sudamericana: 0, middle: 0, relegation: 0,
        relegationLower: 0, relegationUpper: 1, lowSample: false,
      }
      entry[row.outcome] = row.probability
      if (row.outcome === 'relegation') {
        entry.relegationLower = row.lower95
        entry.relegationUpper = row.upper95
        entry.lowSample = row.lowSample
      }
      byPoints.set(row.points, entry)
    }
    return [...byPoints.values()].sort((left, right) => left.points - right.points)
  }, [result])

  const destinyLabel = MAGIC_DESTINIES.find((entry) => entry.id === destiny)!.label
  const chanceOf = (row: MagicRow): number => row[destiny]
  const firstAtLeast = (threshold: number): MagicRow | undefined =>
    rows.find((row) => chanceOf(row) >= threshold)
  const firstAtMost = (threshold: number): MagicRow | undefined =>
    rows.find((row) => chanceOf(row) <= threshold)

  const likely = firstAtLeast(0.5)
  const nearCertain = firstAtLeast(0.9)
  const nearImpossible = firstAtMost(0.1)
  const unlikely = rows.length > 0 && chanceOf(rows[0]!) < 0.5 ? rows[0] : undefined

  return (
    <section className="point-curve-section magic-points" aria-labelledby="magic-points-title">
      <h4 className="points-table-title" id="magic-points-title">A pontuação mágica: quantos pontos bastam?</h4>
      <p className="projection-table-note">
        Escolha o destino e veja a chance dele acontecer dado um total de pontos exato, entre as mesmas {integer.format(result.simulations)} simulações.
        IC 95% cluster-robusto por simulação.
      </p>
      <div className="magic-destiny-picker" role="group" aria-label="Destino para a pontuação mágica">
        {MAGIC_DESTINIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={destiny === entry.id ? 'evolution-chip is-selected' : 'evolution-chip'}
            aria-pressed={destiny === entry.id}
            onClick={() => setDestiny(entry.id)}
          >
            <i className={`zone-bar-swatch ${entry.swatch}`} aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </div>
      <div className="magic-kpis" aria-label={`Linhas do destino para ${destinyLabel}`}>
        {likely && (
          <div className="kpi-card">
            <strong className="kpi-value">{likely.points}<span className="kpi-divider"> pts</span></strong>
            <span className="kpi-label">Com {likely.points} pts, {destinyLabel.toLowerCase()} é mais provável que não ({percent.format(chanceOf(likely))})</span>
          </div>
        )}
        {nearCertain && (
          <div className="kpi-card">
            <strong className="kpi-value">{nearCertain.points}<span className="kpi-divider"> pts</span></strong>
            <span className="kpi-label">Praticamente garantido ({percent.format(chanceOf(nearCertain))})</span>
          </div>
        )}
        {nearImpossible && chanceOf(rows[rows.length - 1]!) > 0.1 && (
          <div className="kpi-card">
            <strong className="kpi-value">{nearImpossible.points}<span className="kpi-divider"> pts</span></strong>
            <span className="kpi-label">Praticamente descartado ({percent.format(chanceOf(nearImpossible))})</span>
          </div>
        )}
        {unlikely && (
          <div className="kpi-card">
            <strong className="kpi-value">{unlikely.points}<span className="kpi-divider"> pts</span></strong>
            <span className="kpi-label">Menor pontuação observada ainda com chance ({percent.format(chanceOf(unlikely))})</span>
          </div>
        )}
      </div>
      <div className="table-scroll" role="region" aria-label={`Probabilidade do destino por pontuação exata: ${destinyLabel}`} tabIndex={0}>
        <table className="projection-table magic-table">
          <thead><tr>
            <th scope="col">Pontos</th>
            {pointCurveOutcomes.map((outcome) => (
              <th key={outcome.id} scope="col" className={`numeric ${outcome.id === destiny ? 'magic-active-col' : ''}`}>{outcome.label}</th>
            ))}
            <th scope="col" className="numeric">Chance de {destinyLabel.toLowerCase()} (IC 95%)</th>
          </tr></thead>
          <tbody>
            {rows.map((row) => {
              const chance = chanceOf(row)
              const isRelegation = destiny === 'relegation'
              return (
                <tr key={row.points}>
                  <th scope="row" className="magic-points-cell">{row.points}</th>
                  {pointCurveOutcomes.map((outcome) => (
                    <td key={outcome.id} className={`numeric games-cell ${outcome.id === destiny ? 'magic-active-value' : chanceOf === undefined ? '' : ''}`}>
                      {percent.format(row[outcome.id])}
                    </td>
                  ))}
                  <td className="magic-bar-cell">
                    <div className="magic-bar" role="img" aria-label={`Com ${row.points} pontos: ${percent.format(chance)} de chance de ${destinyLabel.toLowerCase()}`}>
                      <span className="magic-bar-fill" style={{ width: `${chance * 100}%` }} />
                      {isRelegation && row.lowSample && <span className="magic-bar-low">amostra baixa</span>}
                    </div>
                    {isRelegation && chance > 0 && chance < 1 && (
                      <span className="cell-ci">IC {percent.format(row.relegationLower)}–{percent.format(row.relegationUpper)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const zoneColumns: SortableColumn<ClubProbability>[] = [
  { id: 'position', header: 'Pos', accessor: ({ currentPosition }) => currentPosition, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'title', header: 'Título', accessor: ({ title }) => title, numeric: true },
  { id: 'libertadores', header: 'Libertadores', accessor: ({ libertadores }) => libertadores, numeric: true },
  { id: 'sudamericana', header: 'Sul-Americana', accessor: ({ sudamericana }) => sudamericana, numeric: true },
  { id: 'relegation', header: 'Rebaixamento', accessor: ({ relegation }) => relegation, numeric: true },
]

const pointsColumns: SortableColumn<ClubProbability>[] = [
  { id: 'position', header: 'Pos', accessor: ({ currentPosition }) => currentPosition, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'currentPoints', header: 'Hoje', accessor: ({ currentPoints }) => currentPoints, numeric: true },
  { id: 'median', header: 'Mediana', accessor: ({ pointsStats }) => pointsStats.median, numeric: true },
  { id: 'p25', header: 'Faixa típica (P25)', accessor: ({ pointsStats }) => pointsStats.p25, numeric: true },
  { id: 'p75', header: 'Faixa típica (P75)', accessor: ({ pointsStats }) => pointsStats.p75, numeric: true },
  { id: 'p90', header: 'Cenário alto (P90)', accessor: ({ pointsStats }) => pointsStats.p90, numeric: true },
  { id: 'delta', header: 'Δ vs hoje', accessor: ({ pointsStats, currentPoints }) => pointsStats.median - currentPoints, numeric: true },
]

interface ProbabilityCellProps {
  value: number
  lower: number
  upper: number
}

function ProbabilityCell({ value, lower, upper }: ProbabilityCellProps): JSX.Element {
  // IC só faz sentido entre 0 e 1 exclusivos; em 0%/100% o intervalo é o próprio valor.
  const hasInterval = value > 0 && value < 1
  return (
    <td className={`numeric probability-cell ${value === 0 ? 'probability-cell--zero' : ''}`}>
      <strong>{percent.format(value)}</strong>
      {hasInterval && <span className="cell-ci">IC {percent.format(lower)}–{percent.format(upper)}</span>}
    </td>
  )
}

const ZONE_BAR_SEGMENTS = [
  { key: 'title', className: 'zone-bar--title', label: 'Título' },
  { key: 'libertadores', className: 'zone-bar--libertadores', label: 'Libertadores' },
  { key: 'sudamericana', className: 'zone-bar--sudamericana', label: 'Sul-Americana' },
  { key: 'middle', className: 'zone-bar--middle', label: 'Meio de tabela' },
  { key: 'relegation', className: 'zone-bar--relegation', label: 'Rebaixamento' },
] as const

interface ClubForBar extends ClubProbability {}

/** Barra 100% com as cinco zonas possíveis do clube — leitura instantânea do cenário. */
function ZoneStackedBar({ club }: { club: ClubForBar }): JSX.Element {
  const middle = Math.max(0, 1 - club.title - club.libertadores - club.sudamericana - club.relegation)
  const values: Record<(typeof ZONE_BAR_SEGMENTS)[number]['key'], number> = {
    title: club.title,
    libertadores: club.libertadores,
    sudamericana: club.sudamericana,
    middle,
    relegation: club.relegation,
  }
  const ariaLabel = ZONE_BAR_SEGMENTS.map((segment) => `${segment.label} ${percent.format(values[segment.key])}`).join(', ')
  return (
    <div className="zone-bar" role="img" aria-label={`Cenários de ${club.club}: ${ariaLabel}`}>
      {ZONE_BAR_SEGMENTS.map((segment) => (
        <span key={segment.key} className={`zone-bar-segment ${segment.className}`} style={{ width: `${values[segment.key] * 100}%` }} />
      ))}
    </div>
  )
}

function ZoneBarLegend(): JSX.Element {
  return (
    <div className="zone-bar-legend" aria-hidden="true">
      {ZONE_BAR_SEGMENTS.map((segment) => (
        <span key={segment.key}><i className={`zone-bar-swatch ${segment.className}`} />{segment.label}</span>
      ))}
    </div>
  )
}

function exportProjections(result: ProjectionResult, format: 'csv' | 'xlsx' | 'json'): void {
  const columns = [
    { key: 'position', header: 'Posição Atual' },
    { key: 'club', header: 'Clube' },
    { key: 'currentPoints', header: 'Pontos no Corte' },
    { key: 'title', header: 'Título (%)' },
    { key: 'titleLow', header: 'Título IC 95% Inferior (%)' },
    { key: 'titleHigh', header: 'Título IC 95% Superior (%)' },
    { key: 'libertadores', header: 'Libertadores (%)' },
    { key: 'sudamericana', header: 'Sul-Americana (%)' },
    { key: 'relegation', header: 'Rebaixamento (%)' },
    { key: 'median', header: 'Mediana de Pontos Finais' },
    { key: 'mean', header: 'Média de Pontos Finais' },
    { key: 'p25', header: 'P25 de Pontos Finais' },
    { key: 'p75', header: 'P75 de Pontos Finais' },
    { key: 'p90', header: 'P90 de Pontos Finais' },
    { key: 'stdDev', header: 'Desvio-Padrão de Pontos Finais' },
  ]
  const rows = result.clubProbabilities.map((club) => ({
    position: club.currentPosition,
    club: club.club,
    currentPoints: club.currentPoints,
    title: club.title * 100,
    titleLow: club.titleInterval.lower95 * 100,
    titleHigh: club.titleInterval.upper95 * 100,
    libertadores: club.libertadores * 100,
    sudamericana: club.sudamericana * 100,
    relegation: club.relegation * 100,
    median: club.pointsStats.median,
    mean: Number(club.pointsStats.mean.toFixed(2)),
    p25: club.pointsStats.p25,
    p75: club.pointsStats.p75,
    p90: club.pointsStats.p90,
    stdDev: Number(club.pointsStats.stdDev.toFixed(2)),
  }))
  const filename = `brasileirao-2026-projecoes-n${integer.format(result.simulations)}`
  if (format === 'csv') {
    downloadFile(`${filename}.csv`, 'text/csv;charset=utf-8', toCSV(columns, rows))
    return
  }
  if (format === 'xlsx') {
    downloadFile(`${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buildXlsx([{ name: 'Projeções por clube', columns, rows }]))
    return
  }
  downloadFile(`${filename}.json`, 'application/json;charset=utf-8', toJson({
    dataset: 'Projeções Monte Carlo por clube',
    simulacoes: result.simulations,
    semente: result.seed,
    corteAnalitico: seasonFacts.cutoffLocal,
    colunas: columns.map(({ header }) => header),
    linhas: rows,
  }))
}

function ProjectionPanel({ result, status, onRetry }: ProjectionPanelProps): JSX.Element {
  const [activeAnalysis, setActiveAnalysis] = useState<'por-clube' | 'por-pontuacao'>('por-clube')
  const analysisTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const probabilityRows = useMemo(() => result?.clubProbabilities ?? [], [result])
  const { sortedRows: sortedZones, toggleSort: toggleZoneSort, ariaSort: zoneAriaSort } = useTableSort(probabilityRows, zoneColumns, 'position')
  const { sortedRows: sortedPoints, toggleSort: togglePointsSort, ariaSort: pointsAriaSort } = useTableSort(probabilityRows, pointsColumns, 'position')

  function handleAnalysisTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const views = ['por-clube', 'por-pontuacao'] as const
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % views.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + views.length) % views.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : -1
    if (nextIndex < 0) return
    event.preventDefault()
    setActiveAnalysis(views[nextIndex]!)
    analysisTabRefs.current[nextIndex]?.focus()
  }

  return (
    <section className="projection-section" id="projecoes" aria-labelledby="projection-title">
      <div className="projection-heading">
        <div>
          <p className="eyebrow eyebrow-dark">CENÁRIOS ESTATÍSTICOS</p>
          <h2 id="projection-title">O que ainda pode acontecer</h2>
          <p className="projection-lead">Estimativas para o encerramento da Série A, condicionadas à tabela reconstruída para o corte analítico e aos jogos restantes da tabela básica CBF.</p>
        </div>
        <span className="section-index">03 <span>/ PROJEÇÕES</span></span>
      </div>

      <div className="projection-meta" aria-label="Parâmetros da projeção">
        <span><strong>{integer.format(SIMULATION_COUNT)}</strong> simulações</span>
        <span><strong>{seasonFacts.remainingCount}</strong> jogos restantes</span>
        <span><strong>{cutoffLabel}</strong> corte analítico</span>
        <span><strong>{result?.seed ?? SIMULATION_SEED}</strong> semente fixa</span>
      </div>

      <p className="projection-disclaimer">
        Não são odds nem recomendação de apostas. A dispersão de Monte Carlo mede apenas a variação da simulação com este modelo; não representa toda a incerteza dos dados ou da metodologia.
      </p>

      {status === 'loading' && <p className="projection-status" role="status">Calculando cenários em segundo plano…</p>}
      {status === 'ready' && <p className="sr-only" role="status">Projeção concluída: probabilidades e distribuições para {integer.format(result?.simulations ?? SIMULATION_COUNT)} simulações disponíveis.</p>}
      {status === 'error' && (
        <div className="projection-status projection-error" role="alert">
          <p>Não foi possível executar as simulações neste navegador. Nenhum percentual foi substituído por estimativa manual.</p>
          <button className="filter-button" type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      )}

      <div className="subtabs" role="tablist" aria-label="Análises da projeção">
        <button
          className={activeAnalysis === 'por-clube' ? 'subtab is-selected' : 'subtab'}
          id="aba-por-clube" role="tab" type="button"
          aria-selected={activeAnalysis === 'por-clube'} aria-controls="analise-por-clube"
          tabIndex={activeAnalysis === 'por-clube' ? 0 : -1}
          ref={(element) => { analysisTabRefs.current[0] = element }}
          onClick={() => setActiveAnalysis('por-clube')}
          onKeyDown={(event) => handleAnalysisTabKeyDown(event, 0)}
        >Por clube</button>
        <button
          className={activeAnalysis === 'por-pontuacao' ? 'subtab is-selected' : 'subtab'}
          id="aba-por-pontuacao" role="tab" type="button"
          aria-selected={activeAnalysis === 'por-pontuacao'} aria-controls="analise-por-pontuacao"
          tabIndex={activeAnalysis === 'por-pontuacao' ? 0 : -1}
          ref={(element) => { analysisTabRefs.current[1] = element }}
          onClick={() => setActiveAnalysis('por-pontuacao')}
          onKeyDown={(event) => handleAnalysisTabKeyDown(event, 1)}
        >Por pontuação</button>
      </div>

      {!result && (
        <div className="projection-pending-areas">
          <section className="projection-block projection-placeholder" id="probabilidades-time" aria-labelledby="pending-clubs-title">
            <h3 id="pending-clubs-title">Probabilidades por time</h3>
            <p>{status === 'loading' ? 'Esta análise ficará disponível quando as simulações forem concluídas.' : 'Esta análise não está disponível porque as simulações falharam.'}</p>
          </section>
          <section className="projection-block projection-placeholder" id="por-pontuacao" aria-labelledby="pending-points-title">
            <h3 id="pending-points-title">Probabilidade por pontuação</h3>
            <p>{status === 'loading' ? 'As distribuições e curvas exatas aparecerão após a conclusão das simulações.' : 'As distribuições e curvas não estão disponíveis porque as simulações falharam.'}</p>
          </section>
        </div>
      )}

      {result && (
        <>
          <div role="tabpanel" id="analise-por-clube" aria-labelledby="aba-por-clube" hidden={activeAnalysis !== 'por-clube'}>
          <section className="projection-block" id="probabilidades-time" aria-labelledby="club-probabilities-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">PROJEÇÕES POR CLUBE</p><h3 id="club-probabilities-title">Vagas, permanência e pontos finais</h3></div>
              <span>n = {integer.format(result.simulations)} simulações · IC 95% Wilson</span>
            </div>
            <div className="how-to-read">
              <strong>Como ler:</strong>
              <ul>
                <li><strong>Em que zona o clube pode terminar?</strong> — a barra colorida mostra as cinco zonas possíveis em cada simulação; os percentuais dão a chance de cada uma.</li>
                <li><strong>Quantos pontos o clube deve fazer?</strong> — a mediana é o valor central das simulações; a faixa típica reúne metade central (P25–P75) e o P90 um cenário alto.</li>
                <li>Cada chance vem com o intervalo de confiança de 95% (IC) — a incerteza da própria estimativa com n = {integer.format(result.simulations)}.</li>
              </ul>
            </div>

            <h4 className="points-table-title" id="zones-table-title">Em que zona cada clube pode terminar?</h4>
            <ZoneBarLegend />
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Zonas possíveis por clube nas simulações; role para rolagem horizontal em telas pequenas" tabIndex={0}>
              <table className="projection-table zones-table">
                <thead>
                  <tr>
                    {zoneColumns.map((column) => (
                      <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={zoneAriaSort(column.id)}>
                        <button type="button" className="sort-button" onClick={() => toggleZoneSort(column.id)}>
                          {column.id === 'libertadores' ? 'LIBERTADORES¹' : column.header}
                          <span className="sort-indicator" aria-hidden="true">{zoneAriaSort(column.id) === 'ascending' ? ' ↑' : zoneAriaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                          <span className="sr-only">{zoneAriaSort(column.id) === 'none' ? 'ative para ordenar' : `ordenado ${zoneAriaSort(column.id) === 'ascending' ? 'ascendente' : 'descendente'}`}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedZones.map((club) => (
                    <tr key={club.id}>
                      <th scope="row"><span className="projection-current-position">{String(club.currentPosition).padStart(2, '0')}</span>{club.club}</th>
                      <td className="zone-bar-cell"><ZoneStackedBar club={club} /></td>
                      <ProbabilityCell value={club.title} lower={club.titleInterval.lower95} upper={club.titleInterval.upper95} />
                      <ProbabilityCell value={club.libertadores} lower={club.libertadoresInterval.lower95} upper={club.libertadoresInterval.upper95} />
                      <ProbabilityCell value={club.sudamericana} lower={club.sudamericanaInterval.lower95} upper={club.sudamericanaInterval.upper95} />
                      <ProbabilityCell value={club.relegation} lower={club.relegationInterval.lower95} upper={club.relegationInterval.upper95} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="projection-footnote">¹ Considera as posições 1–5 na tabela (1º–4º direto; 5º preliminar). ² Posições 6–11: seis melhores não classificados à Libertadores, somente pela tabela do Brasileirão. Chances condicionais a este recorte e às vagas geradas pela tabela; títulos de Copa do Brasil e CONMEBOL, que redistribuem vagas, não foram simulados.</p>

            <h4 className="points-table-title" id="points-final-title">Quantos pontos cada clube deve fazer?</h4>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Pontos finais projetados por clube; role para rolagem horizontal em telas pequenas" tabIndex={0}>
              <table className="projection-table points-final-table">
                <thead>
                  <tr>
                    {pointsColumns.map((column) => (
                      <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={pointsAriaSort(column.id)}>
                        <button type="button" className="sort-button" onClick={() => togglePointsSort(column.id)}>
                          {column.header}
                          <span className="sort-indicator" aria-hidden="true">{pointsAriaSort(column.id) === 'ascending' ? ' ↑' : pointsAriaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                          <span className="sr-only">{pointsAriaSort(column.id) === 'none' ? 'ative para ordenar' : `ordenado ${pointsAriaSort(column.id) === 'ascending' ? 'ascendente' : 'descendente'}`}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPoints.map((club) => {
                    const delta = club.pointsStats.median - club.currentPoints
                    const deltaPercent = club.currentPoints === 0 ? 0 : delta / club.currentPoints
                    return (
                      <tr key={club.id}>
                        <th scope="row"><span className="projection-current-position">{String(club.currentPosition).padStart(2, '0')}</span>{club.club}</th>
                        <td className="numeric games-cell">{club.currentPoints}</td>
                        <td className="numeric probability-cell"><strong>{club.pointsStats.median}</strong><span className="cell-ci">média {decimal.format(club.pointsStats.mean)}</span></td>
                        <td className="numeric range-cell">{club.pointsStats.p25}–{club.pointsStats.p75}</td>
                        <td className="numeric games-cell">{club.pointsStats.p90}<span className="cell-ci">mínimo {club.pointsStats.min}</span></td>
                        <td className="numeric">
                          <span className={`delta-badge ${delta > 0 ? 'delta-badge--up' : delta < 0 ? 'delta-badge--down' : 'delta-badge--flat'}`}>
                            {signedDecimal.format(delta)} pts ({signedDecimal.format(deltaPercent * 100)}%)
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="projection-table-note">Mediana e percentis usam a definição nearest-rank sobre as {integer.format(result.simulations)} simulações; Δ compara a mediana projetada com os pontos no corte (valor absoluto e percentual).</p>

            <div className="export-row" role="group" aria-label="Exportar projeções por clube">
              <span className="export-row-label">Baixar as duas tabelas:</span>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'csv')}>CSV</button>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'xlsx')}>XLSX</button>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'json')}>JSON</button>
            </div>
          </section>
          </div>

          <div role="tabpanel" id="analise-por-pontuacao" aria-labelledby="aba-por-pontuacao" hidden={activeAnalysis !== 'por-pontuacao'}>
          <section className="projection-block" id="por-pontuacao" aria-labelledby="points-analysis-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">Probabilidade por pontuação</p><h3 id="points-analysis-title">Quantos pontos levam a quê</h3></div>
              <span>Pontuações inteiras observadas nas mesmas {integer.format(result.simulations)} simulações.</span>
            </div>

            <MagicPointsPanel result={result} />
          </section>
          </div>
        </>
      )}
    </section>
  )
}

export function ProjectionSection(): JSX.Element {
  const { result, status, retry } = useProjection()
  return <ProjectionPanel result={result} status={status} onRetry={retry} />
}

export { ProjectionPanel }
