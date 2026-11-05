import { useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { POINT_CURVE_LOW_SAMPLE_WIDTH, RESULT_GROUPS, SIMULATION_COUNT, SIMULATION_SEED, type ResultGroupId } from './projectionConfig'
import type { ClubProbability, OutcomeDistribution, ProjectionResult } from './projection'
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
const signedDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })
const pointCurveOutcomes = [
  { id: 'libertadores', label: 'Libertadores · 1º–5º' },
  { id: 'sudamericana', label: 'Sul-Americana · 6º–11º' },
  { id: 'other', label: 'Outras posições · 12º–20º' },
] as const

const probabilityColumns: SortableColumn<ClubProbability>[] = [
  { id: 'position', header: 'POS', accessor: ({ currentPosition }) => currentPosition, numeric: true },
  { id: 'club', header: 'CLUBE', accessor: ({ club }) => club, numeric: false },
  { id: 'title', header: 'TÍTULO', accessor: ({ title }) => title, numeric: true },
  { id: 'libertadores', header: 'LIBERTADORES', accessor: ({ libertadores }) => libertadores, numeric: true },
  { id: 'sudamericana', header: 'SUL-AMERICANA', accessor: ({ sudamericana }) => sudamericana, numeric: true },
  { id: 'relegation', header: 'REBAIXAMENTO', accessor: ({ relegation }) => relegation, numeric: true },
  { id: 'median', header: 'MEDIANA DE PONTOS', accessor: ({ pointsStats }) => pointsStats.median, numeric: true },
  { id: 'p90', header: 'P90', accessor: ({ pointsStats }) => pointsStats.p90, numeric: true },
]

interface ProbabilityCellProps {
  value: number
  lower: number
  upper: number
}

function ProbabilityCell({ value, lower, upper }: ProbabilityCellProps): JSX.Element {
  return (
    <td className="numeric probability-cell">
      <strong>{percent.format(value)}</strong>
      <span className="cell-ci">IC 95% {percent.format(lower)}–{percent.format(upper)}</span>
    </td>
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

type PointCurveRow = ProjectionResult['pointCurve']['rows'][number]

interface PointCurveCellProps {
  row: PointCurveRow | undefined
}

function PointCurveCell({ row }: PointCurveCellProps): JSX.Element {
  if (!row) return <td className="numeric curve-cell">—</td>
  return (
    <td className="numeric curve-cell">
      <strong>{percent.format(row.probability)}</strong>
      <span>K/N {integer.format(row.successes)}/{integer.format(row.denominator)}</span>
      <span>IC 95% {percent.format(row.lower95)}–{percent.format(row.upper95)}</span>
      {row.lowSample && <span className="curve-low-sample">Amostra baixa</span>}
    </td>
  )
}

interface PointDistributionProps {
  distribution: OutcomeDistribution
}

function PointDistributionChart({ distribution }: PointDistributionProps): JSX.Element {
  const maxProbability = Math.max(0, ...distribution.points.map((point) => point.probability))
  const chartHeight = Math.max(48, distribution.points.length * 36 + 20)
  const maxBarWidth = 150

  return (
    <figure className="point-distribution-figure">
      <figcaption>Gráfico discreto · barra relativa ao ponto mais frequente; percentual exato ao lado</figcaption>
      {distribution.points.length === 0 ? (
        <p className="empty-distribution">Nenhuma observação nesta categoria nas simulações exibidas.</p>
      ) : (
        <svg
          className="point-distribution-chart"
          role="img"
          aria-label={`Distribuição discreta de pontos para ${distribution.label}, com ${distribution.points.length} pontuações inteiras observadas. Os percentuais e contagens exatos estão na tabela acessível logo abaixo.`}
          viewBox={`0 0 365 ${chartHeight}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {distribution.points.map((point, index) => {
            const y = index * 36 + 15
            const barWidth = maxProbability === 0 ? 0 : point.probability / maxProbability * maxBarWidth
            return (
              <g key={point.points}>
                <text className="point-distribution-value" x="0" y={y + 4}>{point.points} pts</text>
                <rect className="point-distribution-bar-track" x="66" y={y - 7} width={maxBarWidth} height="11" rx="2" />
                <rect className="point-distribution-bar" x="66" y={y - 7} width={barWidth} height="11" rx="2" />
                <text className="point-distribution-percent" x="227" y={y}>{percent.format(point.probability)}</text>
                <text className="point-distribution-sample" x="227" y={y + 13}>K/N {integer.format(point.count)}/{integer.format(distribution.samples)}</text>
              </g>
            )
          })}
        </svg>
      )}
    </figure>
  )
}

function PointDistributionTable({ distribution }: PointDistributionProps): JSX.Element {
  return (
    <div className="exact-point-table-wrap" role="region" aria-label={`Tabela acessível de pontuação exata por resultado: ${distribution.label}`}>
      <table className="projection-table exact-point-table">
        <thead><tr><th scope="col">PONTOS EXATOS</th><th scope="col" className="numeric">K/N NA CATEGORIA</th><th scope="col" className="numeric">P(PONTOS | RESULTADO)</th></tr></thead>
        <tbody>
          {distribution.points.map((point) => (
            <tr key={point.points}>
              <th scope="row">{point.points}</th>
              <td className="numeric">{integer.format(point.count)}/{integer.format(distribution.samples)}</td>
              <td className="numeric probability-cell">{percent.format(point.probability)}</td>
            </tr>
          ))}
          {distribution.points.length === 0 && <tr><td className="empty-distribution-cell" colSpan={3}>Nenhuma pontuação observada para este resultado.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function ProjectionPanel({ result, status, onRetry }: ProjectionPanelProps): JSX.Element {
  const [activeDistribution, setActiveDistribution] = useState<ResultGroupId>('champion')
  const [activeAnalysis, setActiveAnalysis] = useState<'por-clube' | 'por-pontuacao'>('por-clube')
  const analysisTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const outcomeTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedDistribution = result?.pointsAnalysis.distributionByOutcome.find(({ id }) => id === activeDistribution)
  const probabilityRows = useMemo(() => result?.clubProbabilities ?? [], [result])
  const { sortedRows: sortedProbabilities, toggleSort, ariaSort } = useTableSort(probabilityRows, probabilityColumns, 'position')

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

  function handleOutcomeTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const lastIndex = RESULT_GROUPS.length - 1
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % RESULT_GROUPS.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + RESULT_GROUPS.length) % RESULT_GROUPS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lastIndex
            : -1
    if (nextIndex < 0) return
    event.preventDefault()
    const nextOutcome = RESULT_GROUPS[nextIndex]
    if (!nextOutcome) return
    setActiveDistribution(nextOutcome.id)
    outcomeTabRefs.current[nextIndex]?.focus()
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
              <div><p className="eyebrow eyebrow-dark">PROBABILIDADES POR CLUBE</p><h3 id="club-probabilities-title">Disputa pelas vagas e permanência</h3></div>
              <span>Por clube · n = {integer.format(result.simulations)} simulações · IC 95% Wilson</span>
            </div>
            <p className="projection-table-note">Chances condicionais a este recorte e às vagas geradas pela tabela; títulos da Copa do Brasil e de torneios CONMEBOL, que podem redistribuir vagas, não foram simulados. Cada probabilidade vem com intervalo de confiança de 95%; a mediana e os percentis resumem a distribuição de pontos finais de cada clube nas {integer.format(result.simulations)} tabelas simuladas.</p>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Probabilidades simuladas por clube; role para rolagem horizontal em telas pequenas" tabIndex={0}>
              <table className="projection-table">
                <thead>
                  <tr>
                    {probabilityColumns.map((column) => (
                      <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={ariaSort(column.id)}>
                        <button type="button" className="sort-button" onClick={() => toggleSort(column.id)}>
                          {column.id === 'libertadores' ? 'LIBERTADORES¹' : column.id === 'sudamericana' ? 'SUL-AMERICANA²' : column.header}
                          <span className="sort-indicator" aria-hidden="true">{ariaSort(column.id) === 'ascending' ? ' ↑' : ariaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                          <span className="sr-only">{ariaSort(column.id) === 'none' ? 'ative para ordenar' : `ordenado ${ariaSort(column.id) === 'ascending' ? 'ascendente' : 'descendente'}`}</span>
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="numeric">P25–P75</th>
                    <th scope="col" className="numeric">Δ MEDIANA</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProbabilities.map((club) => {
                    const delta = club.pointsStats.median - club.currentPoints
                    const deltaPercent = club.currentPoints === 0 ? 0 : delta / club.currentPoints
                    return (
                      <tr key={club.id}>
                        <th scope="row"><span className="projection-current-position">{String(club.currentPosition).padStart(2, '0')}</span>{club.club}</th>
                        <ProbabilityCell value={club.title} lower={club.titleInterval.lower95} upper={club.titleInterval.upper95} />
                        <ProbabilityCell value={club.libertadores} lower={club.libertadoresInterval.lower95} upper={club.libertadoresInterval.upper95} />
                        <ProbabilityCell value={club.sudamericana} lower={club.sudamericanaInterval.lower95} upper={club.sudamericanaInterval.upper95} />
                        <ProbabilityCell value={club.relegation} lower={club.relegationInterval.lower95} upper={club.relegationInterval.upper95} />
                        <td className="numeric probability-cell"><strong>{club.pointsStats.median}</strong><span className="cell-ci">atual {club.currentPoints}</span></td>
                        <td className="numeric probability-cell"><strong>{club.pointsStats.p90}</strong><span className="cell-ci">P10 {club.pointsStats.p10}</span></td>
                        <td className="numeric range-cell">{club.pointsStats.p25}–{club.pointsStats.p75}</td>
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
            <div className="export-row" role="group" aria-label="Exportar projeções por clube">
              <span className="export-row-label">Baixar esta tabela:</span>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'csv')}>CSV</button>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'xlsx')}>XLSX</button>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'json')}>JSON</button>
            </div>
            <p className="projection-footnote">¹ Considera as posições 1–5 na tabela (1º–4º direto; 5º preliminar). ² Posições 6–11: seis melhores não classificados à Libertadores, somente pela tabela do Brasileirão. Mediana e percentis usam a definição nearest-rank sobre as {integer.format(result.simulations)} simulações; Δ MEDIANA compara a mediana projetada com os pontos no corte (valor absoluto e percentual).</p>
          </section>
          </div>

          <div role="tabpanel" id="analise-por-pontuacao" aria-labelledby="aba-por-pontuacao" hidden={activeAnalysis !== 'por-pontuacao'}>
          <section className="projection-block" id="por-pontuacao" aria-labelledby="points-analysis-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">PROBABILIDADE POR PONTUAÇÃO</p><h3 id="points-analysis-title">Duas leituras condicionais</h3></div>
              <span>Pontuações inteiras observadas nas mesmas {integer.format(result.simulations)} simulações.</span>
            </div>
            <section className="point-distribution-section" aria-labelledby="distribution-title">
              <h4 className="points-table-title" id="distribution-title">Pontuação exata dado resultado final</h4>
              <p className="projection-table-note">P(pontuação exata | resultado). As categorias aqui são exclusivas: Campeão; Libertadores (2º–5º); Sul-Americana (6º–11º); Meio de tabela (12º–16º); Rebaixamento (17º–20º). N é o total de clubes-simulações da categoria; K/N mostra a contagem exata e o denominador.</p>
              <div className="outcome-tabs" role="tablist" aria-label="Selecionar resultado final para distribuição de pontos">
                {RESULT_GROUPS.map((group, index) => (
                  <button
                    aria-controls="point-distribution-panel"
                    aria-selected={activeDistribution === group.id}
                    className="outcome-tab"
                    id={`point-tab-${group.id}`}
                    key={group.id}
                    onClick={() => setActiveDistribution(group.id)}
                    onKeyDown={(event) => handleOutcomeTabKeyDown(event, index)}
                    ref={(element) => { outcomeTabRefs.current[index] = element }}
                    role="tab"
                    tabIndex={activeDistribution === group.id ? 0 : -1}
                    type="button"
                  >{group.label}</button>
                ))}
              </div>
              {selectedDistribution && (
                <div className="point-distribution-panel" id="point-distribution-panel" role="tabpanel" aria-labelledby={`point-tab-${selectedDistribution.id}`} tabIndex={0}>
                  <p className="distribution-sample-count">{selectedDistribution.label}: N = {integer.format(selectedDistribution.samples)} clubes-simulações.</p>
                  <PointDistributionChart distribution={selectedDistribution} />
                  <PointDistributionTable distribution={selectedDistribution} />
                </div>
              )}
            </section>

            <section className="point-curve-section" aria-labelledby="point-curve-title">
              <h4 className="points-table-title" id="point-curve-title">Resultado dado pontuação exata</h4>
              <p className="projection-table-note">P(resultado | pontuação exata). Nesta curva, Libertadores inclui posições 1º–5º e Sul-Americana 6º–11º; “Outras” reúne 12º–20º. K/N = clubes-simulações com o resultado / total na pontuação exata. IC 95% calculado com clusters de simulações; “amostra baixa” marca largura de intervalo ≥ {percent.format(POINT_CURVE_LOW_SAMPLE_WIDTH)}. Categorias com K=0 não são estimadas e aparecem como —.</p>
              <div className="table-scroll projection-table-scroll" role="region" aria-label="Curva de resultado condicionado à pontuação exata; role para rolagem horizontal" tabIndex={0}>
              <table className="projection-table point-curve-table">
                <thead><tr><th scope="col">PONTOS EXATOS</th>{pointCurveOutcomes.map((outcome) => <th className="numeric" scope="col" key={outcome.id}>{outcome.label}</th>)}</tr></thead>
                <tbody>
                  {[...new Set(result.pointCurve.rows.map((row) => row.points))].map((points) => (
                    <tr key={points}>
                      <th scope="row">{points}</th>
                      {pointCurveOutcomes.map((outcome) => <PointCurveCell key={outcome.id} row={result.pointCurve.rows.find((row) => row.points === points && row.outcome === outcome.id)} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
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
