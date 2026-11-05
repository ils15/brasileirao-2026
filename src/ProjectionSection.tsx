import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { POINT_CURVE_LOW_SAMPLE_WIDTH, RESULT_GROUPS, SHRINKAGE_CANDIDATES, SIMULATION_COUNT, SIMULATION_SEED, type ResultGroupId } from './projectionConfig'
import type { OutcomeDistribution, ProjectionResult } from './projection'
import { HISTORICAL_SOURCE } from './historicalSeasons'
import { CURRENT_SEASON_SOURCE } from './currentSeasonResults'
import { ANALYTICAL_CUTOFF_LOCAL } from './sourceMetadata'

const CBF_URL = 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026'
const FIXTURES_URL = 'https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_BA_sica_Brasileiro_SA_rie_A_2026_d64996b4d8.pdf'
const REC_URL = 'https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf'
const HISTORICAL_URL = 'https://www.football-data.co.uk/new/BR.csv'

type ProjectionStatus = 'loading' | 'ready' | 'error'

interface ProjectionPanelProps {
  result: ProjectionResult | null
  status: ProjectionStatus
  onRetry: () => void
}

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const pointCurveOutcomes = [
  { id: 'libertadores', label: 'Libertadores · 1º–5º' },
  { id: 'sudamericana', label: 'Sul-Americana · 6º–11º' },
  { id: 'other', label: 'Outras posições · 12º–20º' },
] as const

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
  const outcomeTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedDistribution = result?.pointsAnalysis.distributionByOutcome.find(({ id }) => id === activeDistribution)

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
        <span><strong>48</strong> jogos restantes</span>
        <span><strong>04/11/2026 · 13:00 BRT</strong> corte analítico</span>
        <span><strong>{SIMULATION_SEED}</strong> semente fixa</span>
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
          <section className="projection-block projection-placeholder" id="estatisticas" aria-labelledby="pending-stats-title">
            <h3 id="pending-stats-title">Estatísticas e metodologia</h3>
            <p>{status === 'loading' ? 'As estatísticas de validação serão exibidas quando as simulações forem concluídas.' : 'As estatísticas de validação não estão disponíveis porque as simulações falharam.'}</p>
          </section>
        </div>
      )}

      {result && (
        <>
          <section className="projection-block" id="probabilidades-time" aria-labelledby="club-probabilities-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">PROBABILIDADES POR CLUBE</p><h3 id="club-probabilities-title">Disputa pelas vagas e permanência</h3></div>
              <span>Por clube, entre {integer.format(result.simulations)} tabelas simuladas</span>
            </div>
            <p className="projection-table-note">Chances condicionais a este recorte e às vagas geradas pela tabela; títulos da Copa do Brasil e de torneios CONMEBOL, que podem redistribuir vagas, não foram simulados.</p>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Probabilidades simuladas por clube; role para rolagem horizontal em telas pequenas" tabIndex={0}>
              <table className="projection-table">
                <thead><tr><th scope="col">CLUBE</th><th scope="col" className="numeric">TÍTULO</th><th scope="col" className="numeric">LIBERTADORES¹</th><th scope="col" className="numeric">SUL-AMERICANA²</th><th scope="col" className="numeric">REBAIXAMENTO</th></tr></thead>
                <tbody>
                  {result.clubProbabilities.map((club) => (
                    <tr key={club.id}>
                      <th scope="row"><span className="projection-current-position">{String(club.currentPosition).padStart(2, '0')}</span>{club.club}</th>
                      <td className="numeric probability-cell">{percent.format(club.title)}</td>
                      <td className="numeric probability-cell">{percent.format(club.libertadores)}</td>
                      <td className="numeric probability-cell">{percent.format(club.sudamericana)}</td>
                      <td className="numeric probability-cell">{percent.format(club.relegation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="projection-footnote">¹ Considera as posições 1–5 na tabela (1º–4º direto; 5º preliminar). ² Posições 6–11: seis melhores não classificados à Libertadores, somente pela tabela do Brasileirão.</p>
          </section>

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

          <section className="projection-block backtest-block" id="estatisticas" aria-labelledby="backtest-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">VALIDAÇÃO TEMPORAL</p><h3 id="backtest-title">Backtest 2021–2025</h3></div>
              <span>Resultado de jogo H/empate/F · menor Brier é melhor</span>
            </div>
            <p className="backtest-summary">
              Em {integer.format(result.backtest.matches)} jogos futuros não usados no ajuste, o Brier de resultado H/empate/F foi <strong>{decimal.format(result.backtest.modelBrier)}</strong> contra <strong>{decimal.format(result.backtest.baselineBrier)}</strong> da referência de frequências históricas ({percent.format(result.backtest.relativeImprovement)} menor). O Brier dos grupos finais por posição foi <strong>{decimal.format(result.backtest.tableBrier)}</strong> contra <strong>{decimal.format(result.backtest.tableBaselineBrier)}</strong> da classificação observada no corte ({percent.format(result.backtest.tableRelativeImprovement)} menor; {integer.format(result.backtest.tableSimulationsPerSeason)} simulações por temporada). Em cada ano, o corte fica próximo do 300º jogo e kickoffs empatados não são separados; somente temporadas anteriores e jogos até o corte alimentam a previsão. Esses Brier medem a política walk-forward do modelo baseline: o k de cada ano foi escolhido apenas com anos anteriores (2021 usa k=12 pré-fixado). Separadamente, k={result.featureBacktest.productionShrinkageMatches} usado na projeção 2026 foi escolhido entre {SHRINKAGE_CANDIDATES.length} candidatos pelo Brier da variante casa/fora nas mesmas cinco dobras temporais. Os Brier baseline acima não validam esse k de produção independentemente, e não há validação externa independente.
            </p>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Resultados anuais do backtest temporal" tabIndex={0}>
              <table className="projection-table backtest-table">
                <thead><tr><th scope="col">ANO TESTADO</th><th scope="col" className="numeric">JOGOS FORA DA AMOSTRA</th><th scope="col" className="numeric">k HISTÓRICO</th><th scope="col" className="numeric">BRIER H/X/F · MODELO</th><th scope="col" className="numeric">BRIER H/X/F · REFERÊNCIA</th><th scope="col" className="numeric">BRIER ZONAS · MODELO</th><th scope="col" className="numeric">BRIER ZONAS · TABELA NO CORTE</th></tr></thead>
                <tbody>{result.backtest.seasons.map((season) => <tr key={season.year}><th scope="row">{season.year}</th><td className="numeric">{integer.format(season.matches)}</td><td className="numeric">{season.shrinkageMatches}</td><td className="numeric">{decimal.format(season.modelBrier)}</td><td className="numeric">{decimal.format(season.baselineBrier)}</td><td className="numeric">{decimal.format(season.tableBrier)}</td><td className="numeric">{decimal.format(season.tableBaselineBrier)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="projection-block ablation-block" aria-labelledby="ablation-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">TESTE DE RECURSOS</p><h3 id="ablation-title">Ablation walk-forward 2021–2025</h3></div>
              <span>Mesmo teste por temporada · menor Brier é melhor</span>
            </div>
            <p className="projection-table-note">Brier de resultado H/empate/F para baseline, forças casa/fora, confronto direto (H2H) e combinação. Os kickoffs empatados ficam na mesma dobra; por isso o teste tem 80 ou 82 jogos conforme a temporada. As variantes não mostram melhoria consistente em todos os anos. H2H é apenas contexto e tem peso zero na projeção. O k={result.featureBacktest.productionShrinkageMatches} da produção foi selecionado entre {SHRINKAGE_CANDIDATES.length} candidatos no conjunto das mesmas cinco temporadas e não tem validação independente.</p>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Ablação temporal de recursos" tabIndex={0}>
              <table className="projection-table backtest-table ablation-table">
                <thead><tr><th scope="col">ANO TESTADO</th><th scope="col" className="numeric">JOGOS DE TESTE</th><th scope="col" className="numeric">k CASA/FORA</th><th scope="col" className="numeric">k COMBINADO</th><th scope="col" className="numeric">BRIER BASELINE</th><th scope="col" className="numeric">BRIER CASA/FORA</th><th scope="col" className="numeric">BRIER H2H</th><th scope="col" className="numeric">BRIER COMBINADO</th></tr></thead>
                <tbody>{result.featureBacktest.seasons.map((season) => <tr key={season.year}><th scope="row">{season.year}</th><td className="numeric">{integer.format(season.testMatches)}</td><td className="numeric">{season.homeAwayShrinkageMatches}</td><td className="numeric">{season.combinedShrinkageMatches}</td><td className="numeric">{decimal.format(season.baseline.brier)}</td><td className="numeric">{decimal.format(season.homeAway.brier)}</td><td className="numeric">{decimal.format(season.h2h.brier)}</td><td className="numeric">{decimal.format(season.combined.brier)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <details className="projection-method">
            <summary>Fórmula, regras, dados e limitações</summary>
            <div className="method-copy">
              <h3>Método de gols esperados</h3>
              <p>Nos 1.900 placares de 2021–2025, μ<sub>casa</sub> = {decimal.format(result.leagueAverageGoals.home)} e μ<sub>fora</sub> = {decimal.format(result.leagueAverageGoals.away)} são as médias por mando. Para cada clube e mando v, as taxas de ataque e gols sofridos usam (gols 2026<sub>c,v</sub> + k × taxa histórica<sub>c,v</sub>)/(jogos 2026<sub>c,v</sub> + k), com k = {result.featureBacktest.productionShrinkageMatches}. As taxas históricas específicas por clube/mando são ponderadas por recência (meia-vida de 2,5 temporadas) e regularizadas para a média da liga com 20 jogos ponderados prévios. λ<sub>casa</sub> = μ<sub>casa</sub> × ataque<sub>mandante,casa</sub>/μ<sub>casa</sub> × defesa<sub>visitante,fora</sub>/μ<sub>casa</sub>; λ<sub>fora</sub> = μ<sub>fora</sub> × ataque<sub>visitante,fora</sub>/μ<sub>fora</sub> × defesa<sub>mandante,casa</sub>/μ<sub>fora</sub>. Placares são amostrados de Poisson independentes.</p>
              <p>Foram simulados 20.000 campeonatos com semente fixa {SIMULATION_SEED}; cada um incorpora os 48 confrontos informados (incluindo oito adiados) e os pontos, vitórias e gols do snapshot. As posições usam pontos, vitórias, saldo e gols pró. Para empate de dois clubes, os resultados H2H concluídos de 2026 nos snapshots disponíveis são acumulados com os resultados simulados; placares individuais não foram conferidos contra a CBF. O REC também considera cartões e sorteio, ausentes dos dados. Empates ainda não resolvidos usam desempate uniforme reprodutível, então não há aplicação integral dos critérios oficiais.</p>
              <p>O backtest usa o limite dos primeiros 300 jogos em ordem cronológica como corte e as partidas seguintes como teste; kickoffs idênticos não são separados, portanto o tamanho do conjunto de teste pode variar. Médias, forças e frequências são estimadas sem jogos posteriores ao corte; a política anual de k usa somente os anos anteriores (2021 usa k=12 pré-fixado). Para 2026, k foi escolhido entre {SHRINKAGE_CANDIDATES.join(', ')} pelo Brier de casa/fora das mesmas dobras walk-forward 2021–2025; essa seleção não tem validação independente. As ablações de casa/fora e H2H estão expostas acima; H2H não entra na previsão de 2026 porque não melhorou de modo consistente.</p>
              <p>A distribuição P(pontuação exata | resultado) conta clubes×simulação em cada total inteiro observado dentro de categorias finais exclusivas; cada valor exibe K/N, em que N é o total de clubes-simulações da categoria, e pontos com K=0 são omitidos. A curva separada P(resultado | pontuação exata) usa Libertadores 1º–5º e Sul-Americana 6º–11º, conforme a definição já adotada. Nela, cada simulação é um cluster no IC de 95%, para não tratar os 20 clubes da mesma tabela como independentes. “Amostra baixa” significa intervalo com largura de ao menos {percent.format(POINT_CURVE_LOW_SAMPLE_WIDTH)}; resultados com K=0 não são estimados.</p>
              <p>As regras históricas eram: 1º campeão; 2º–6º Libertadores; 7º–12º Sul-Americana; 13º–16º meio; 17º–20º rebaixamento. Para 2026: 1º–4º Libertadores direta, 5º preliminar, 6º–11º Sul-Americana e quatro últimos rebaixados. Vagas de copas nacionais/CONMEBOL e suas redistribuições não são simuladas. O desempate usa pontos, vitórias, saldo e gols pró; o H2H 2026 disponível entra somente no desempate entre dois clubes, nunca nas probabilidades. H2H de 2021–2025 é exibido como contexto; cartões e sorteio não são simulados.</p>
              <p>O corte de projeção é {ANALYTICAL_CUTOFF_LOCAL.replace('T', ' ').replace('-03:00', ' BRT')}; a coleta é distinta: Football-Data, ESPN e página CBF foram capturados em {CURRENT_SEASON_SOURCE.cbfStandings.collectedAt.replace('T', ' ')}. O HTML CBF arquivado imprime “{CURRENT_SEASON_SOURCE.cbfStandings.displayedTimestamp}”; fuso e semântica de publicação/atualização não são indicados. A CBF foi usada somente para conferir agregados, não para validar resultados individuais. Dos {CURRENT_SEASON_SOURCE.footballData.rows2026} resultados de Football-Data, somam-se dois placares ESPN com kickoffs anteriores ao corte — Chapecoense 1–2 Mirassol (03/11 22:30Z, evento 401841304) e Internacional 1–0 Coritiba (04/11 00:30Z, evento 401841301) — totalizando 332 resultados. Os snapshots e hashes estão em <code>data/source-snapshots/</code>. O calendário contém 380 jogos da tabela básica CBF, dos quais 48 permanecem. Football-Data não informa fuso horário no campo Time e alerta para erros de compilação; seu CSV 2026 não tinha esses dois resultados. É fonte secundária.</p>
              <p>Os 1.900 placares históricos foram empacotados com data/hora do CSV e ordinal original por temporada. O pacote histórico informa mtime local {HISTORICAL_SOURCE.localFileMtime} (metadado de arquivo, não timestamp de publicação) e SHA-256 <code className="source-hash">{HISTORICAL_SOURCE.sha256}</code>; a cópia bruta está preservada em <code>data/source-snapshots/football-data-BR.csv</code>, fora dos ativos de runtime. A CBF foi comparada apenas nos totais finais de pontos, jogos, vitórias, empates, derrotas e gols de 100 clubes-temporada, sem divergências; datas e placares não foram verificados jogo a jogo.</p>
              <p>Fontes: <a href={CBF_URL} target="_blank" rel="noreferrer">tabela CBF 2026</a> · <a href={FIXTURES_URL} target="_blank" rel="noreferrer">tabela básica CBF de jogos 2026</a> · <a href={REC_URL} target="_blank" rel="noreferrer">REC CBF 2026, arts. 6º–8º e 15</a> · <a href={HISTORICAL_URL} target="_blank" rel="noreferrer">Football-Data — placares históricos</a>.</p>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

export function ProjectionSection(): JSX.Element {
  const [result, setResult] = useState<ProjectionResult | null>(null)
  const [status, setStatus] = useState<ProjectionStatus>('loading')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setStatus('error')
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      setStatus('error')
      return
    }
    setStatus('loading')
    worker.onmessage = (event: MessageEvent<ProjectionResult>): void => {
      setResult(event.data)
      setStatus('ready')
      worker.terminate()
    }
    worker.onerror = (): void => {
      setStatus('error')
      worker.terminate()
    }
    worker.postMessage({ type: 'run' })
    return () => worker.terminate()
  }, [retryCount])

  return <ProjectionPanel result={result} status={status} onRetry={() => setRetryCount((count) => count + 1)} />
}

export { ProjectionPanel }
