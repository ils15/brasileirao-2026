import { useMemo, type JSX } from 'react'
import { POINT_CURVE_LOW_SAMPLE_WIDTH, SHRINKAGE_CANDIDATES, SIMULATION_SEED } from './projectionConfig'
import type { ProjectionResult } from './projection'
import { HISTORICAL_SOURCE } from './historicalSeasons'
import { CURRENT_SEASON_SOURCE } from './currentSeasonResults'
import { ANALYTICAL_CUTOFF_LOCAL, ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'
import { productionTrainingMatches } from './modelBacktest'
import { expectedGoalsBreakdown, teamStrengthTable, historicalGoalAverages } from './matchModel'
import { currentClubs, remainingFixtures } from './projectionData'
import { seasonFacts } from './seasonFacts'
import type { ProjectionStatus } from './ProjectionContext'

const CBF_URL = 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026'
const FIXTURES_URL = 'https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_BA_sica_Brasileiro_SA_rie_A_2026_d64996b4d8.pdf'
const REC_URL = 'https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf'
const HISTORICAL_URL = 'https://www.football-data.co.uk/new/BR.csv'

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const rate = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface MethodologyPanelProps {
  result: ProjectionResult | null
  status: ProjectionStatus
  onRetry: () => void
}

function StrengthTable({ result }: { result: ProjectionResult }): JSX.Element {
  const rows = useMemo(() => {
    const k = result.featureBacktest.productionShrinkageMatches
    const averages = historicalGoalAverages(productionTrainingMatches)
    return teamStrengthTable(productionTrainingMatches, 2026, k, currentClubs.map(({ id }) => id), averages)
  }, [result])
  const league = rows.length > 0
    ? rows.reduce((sum, row) => sum + (row.attackHome + row.attackAway) / 2, 0) / rows.length
    : 0
  const nameFor = new Map(currentClubs.map(({ id, club }) => [id, club]))

  return (
    <section className="projection-block" id="forcas-time" aria-labelledby="strength-title">
      <div className="projection-block-heading">
        <div><p className="eyebrow eyebrow-dark">RASTREABILIDADE</p><h3 id="strength-title">Forças por clube e mando</h3></div>
        <span>Taxas regulares (gols/jogo) · k = {result.featureBacktest.productionShrinkageMatches}</span>
      </div>
      <p className="projection-table-note">
        As taxas de ataque e defesa por mando que alimentam cada λ do painel de Confrontos: média da liga na base de treino
        = {rate.format(league)} gols/jogo; acima de 1,0× a média indica força ofensiva/defensiva relativa. Tabela exportável na aba Dados &amp; Auditoria.
      </p>
      <div className="table-scroll projection-table-scroll" role="region" aria-label="Forças de ataque e defesa por clube e mando" tabIndex={0}>
        <table className="projection-table strength-table">
          <thead><tr><th scope="col">CLUBE</th><th scope="col" className="numeric">ATAQUE CASA</th><th scope="col" className="numeric">DEFESA CASA</th><th scope="col" className="numeric">ATAQUE FORA</th><th scope="col" className="numeric">DEFESA FORA</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clubId}>
                <th scope="row">{nameFor.get(row.clubId) ?? row.clubId}</th>
                <td className="numeric">{rate.format(row.attackHome)}</td>
                <td className="numeric">{rate.format(row.defenseHome)}</td>
                <td className="numeric">{rate.format(row.attackAway)}</td>
                <td className="numeric">{rate.format(row.defenseAway)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function NumericExample({ result }: { result: ProjectionResult }): JSX.Element {
  const example = useMemo(() => {
    const fixture = remainingFixtures[0]!
    const k = result.featureBacktest.productionShrinkageMatches
    const breakdown = expectedGoalsBreakdown(fixture.home, fixture.away, productionTrainingMatches, 2026, k)
    return { fixture, k, breakdown }
  }, [result])
  const nameFor = new Map(currentClubs.map(({ id, club }) => [id, club]))
  const home = nameFor.get(example.fixture.home) ?? example.fixture.home
  const away = nameFor.get(example.fixture.away) ?? example.fixture.away
  const { averages, expected, homeAttackRate, awayDefenseRate } = example.breakdown

  return (
    <section className="projection-block" aria-labelledby="numeric-example-title">
      <div className="projection-block-heading">
        <div><p className="eyebrow eyebrow-dark">EXEMPLO NUMÉRICO</p><h3 id="numeric-example-title">De onde vem o λ de {home} × {away}</h3></div>
        <span>Primeiro jogo pendente · mesmos números do painel de Confrontos</span>
      </div>
      <ol className="method-steps">
        <li><strong>Base de treino:</strong> média de gols por mando na base efetiva — μ<sub>casa</sub> = {decimal.format(averages.home)}, μ<sub>fora</sub> = {decimal.format(averages.away)} (histórico 2021–2025 + {seasonFacts.playedCount} jogos de 2026 até o corte).</li>
        <li><strong>Força de {home} em casa:</strong> taxa de ataque regularizada = {decimal.format(homeAttackRate)} gols/jogo (média da liga como mandante: {decimal.format(averages.home)}).</li>
        <li><strong>Defesa de {away} fora:</strong> taxa de gols sofridos como visitante = {decimal.format(awayDefenseRate)} gols/jogo.</li>
        <li><strong>Decomposição:</strong> λ<sub>{home}</sub> = μ<sub>casa</sub> × (ataque<sub>{home}</sub>/μ<sub>casa</sub>) × (defesa<sub>{away}</sub>/μ<sub>casa</sub>) = {decimal.format(averages.home)} × ({decimal.format(homeAttackRate)}/{decimal.format(averages.home)}) × ({decimal.format(awayDefenseRate)}/{decimal.format(averages.home)}) = <strong>{decimal.format(expected.home)}</strong>.</li>
        <li><strong>Resultado:</strong> λ de {home} = {decimal.format(expected.home)} e λ de {away} = {decimal.format(expected.away)} alimentam duas Poisson independentes; os marginais H/E/F viram as barras do painel de Confrontos.</li>
      </ol>
      <p className="projection-table-note">Piso de 0,05 gols aplicado a cada λ; encadeamento idêntico ao usado nos 48 confrontos da simulação.</p>
    </section>
  )
}

/**
 * Aba Metodologia & Validação: backtest, ablação, forças por clube, exemplo
 * numérico do λ e as fórmulas/limitações — separada das probabilidades para
 * dar rastreabilidade completa aos números publicados.
 */
export function MethodologyPanel({ result, status, onRetry }: MethodologyPanelProps): JSX.Element {
  return (
    <section className="projection-section methodology-section" id="estatisticas" aria-labelledby="methodology-title">
      <div className="projection-heading">
        <div>
          <p className="eyebrow eyebrow-dark">COMO OS NÚMEROS SÃO FEITOS</p>
          <h2 id="methodology-title">Metodologia &amp; Validação</h2>
          <p className="projection-lead">Fórmulas em execução, validação walk-forward 2021–2025, forças por clube e um exemplo numérico rastreável — tudo derivado dos dados empacotados, sem números manuais.</p>
        </div>
        <span className="section-index">06 <span>/ MÉTODO</span></span>
      </div>

      {status === 'loading' && <p className="projection-status" role="status">Calculando validação em segundo plano…</p>}
      {status === 'error' && (
        <div className="projection-status projection-error" role="alert">
          <p>Não foi possível executar as simulações neste navegador. As estatísticas de validação não serão substituídas por estimativa manual.</p>
          <button className="filter-button" type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      )}

      {result && (
        <>
          <section className="projection-block backtest-block" aria-labelledby="backtest-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">VALIDAÇÃO TEMPORAL</p><h3 id="backtest-title">Backtest 2021–2025</h3></div>
              <span>Resultado de jogo H/empate/F · menor Brier é melhor</span>
            </div>
            <p className="backtest-summary">
              Em {integer.format(result.backtest.matches)} jogos futuros não usados no ajuste, o Brier de resultado H/empate/F foi <strong>{decimal.format(result.backtest.modelBrier)}</strong> contra <strong>{decimal.format(result.backtest.baselineBrier)}</strong> da referência de frequências históricas ({percent.format(result.backtest.relativeImprovement)} menor). O Brier dos grupos finais por posição foi <strong>{decimal.format(result.backtest.tableBrier)}</strong> contra <strong>{decimal.format(result.backtest.tableBaselineBrier)}</strong> da classificação observada no corte ({percent.format(result.backtest.tableRelativeImprovement)} menor; {integer.format(result.backtest.tableSimulationsPerSeason)} simulações por temporada). Em cada ano, o corte fica próximo do 300º jogo e kickoffs empatados não são separados; somente temporadas anteriores e jogos até o corte alimentam a previsão. Esses Brier medem a política walk-forward do modelo baseline: o k de cada ano foi escolhido apenas com anos anteriores (2021 usa k=12 pré-fixado). Separadamente, k={result.featureBacktest.productionShrinkageMatches} usado na projeção 2026 segue a mesma política: é o k selecionado para a temporada 2025 usando apenas os anos anteriores, entre {SHRINKAGE_CANDIDATES.length} candidatos pelo Brier da variante casa/fora. Não há validação externa independente desse k de produção.
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
            <p className="projection-table-note">Brier de resultado H/empate/F para baseline, forças casa/fora, confronto direto (H2H) e combinação. Os kickoffs empatados ficam na mesma dobra; por isso o teste tem 80 ou 82 jogos conforme a temporada. As variantes não mostram melhoria consistente em todos os anos. H2H é apenas contexto e tem peso zero na projeção. O k={result.featureBacktest.productionShrinkageMatches} da produção é o mesmo escolhido para 2025 com apenas os anos anteriores (fora da amostra); não há validação independente adicional.</p>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Ablação temporal de recursos" tabIndex={0}>
              <table className="projection-table backtest-table ablation-table">
                <thead><tr><th scope="col">ANO TESTADO</th><th scope="col" className="numeric">JOGOS DE TESTE</th><th scope="col" className="numeric">k CASA/FORA</th><th scope="col" className="numeric">k COMBINADO</th><th scope="col" className="numeric">BRIER BASELINE</th><th scope="col" className="numeric">BRIER CASA/FORA</th><th scope="col" className="numeric">BRIER H2H</th><th scope="col" className="numeric">BRIER COMBINADO</th></tr></thead>
                <tbody>{result.featureBacktest.seasons.map((season) => <tr key={season.year}><th scope="row">{season.year}</th><td className="numeric">{integer.format(season.testMatches)}</td><td className="numeric">{season.homeAwayShrinkageMatches}</td><td className="numeric">{season.combinedShrinkageMatches}</td><td className="numeric">{decimal.format(season.baseline.brier)}</td><td className="numeric">{decimal.format(season.homeAway.brier)}</td><td className="numeric">{decimal.format(season.h2h.brier)}</td><td className="numeric">{decimal.format(season.combined.brier)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <StrengthTable result={result} />
          <NumericExample result={result} />

          <details className="projection-method" open>
            <summary>Fórmula, regras, dados e limitações</summary>
            <div className="method-copy">
              <h3>Método de gols esperados</h3>
              <p>Na base de treino efetiva (1.900 placares de 2021–2025 mais os {seasonFacts.playedCount} resultados de 2026 até o corte), μ<sub>casa</sub> = {decimal.format(result.trainingGoalAverages.home)} e μ<sub>fora</sub> = {decimal.format(result.trainingGoalAverages.away)} são as médias por mando usadas pelo modelo; no histórico puro de 2021–2025, μ<sub>casa</sub> = {decimal.format(result.leagueAverageGoals.home)} e μ<sub>fora</sub> = {decimal.format(result.leagueAverageGoals.away)}. Para cada clube e mando v, as taxas de ataque e gols sofridos usam (gols 2026<sub>c,v</sub> + k × taxa histórica<sub>c,v</sub>)/(jogos 2026<sub>c,v</sub> + k), com k = {result.featureBacktest.productionShrinkageMatches}. As taxas históricas específicas por clube/mando são ponderadas por recência (meia-vida de 2,5 temporadas) e regularizadas para a média da liga com 20 jogos ponderados prévios. λ<sub>casa</sub> = μ<sub>casa</sub> × ataque<sub>mandante,casa</sub>/μ<sub>casa</sub> × defesa<sub>visitante,fora</sub>/μ<sub>casa</sub>; λ<sub>fora</sub> = μ<sub>fora</sub> × ataque<sub>visitante,fora</sub>/μ<sub>fora</sub> × defesa<sub>mandante,casa</sub>/μ<sub>fora</sub>. Placares são amostrados de Poisson independentes.</p>
              <p>Foram simulados {integer.format(result.simulations)} campeonatos com semente fixa {SIMULATION_SEED}; cada um incorpora os {seasonFacts.remainingCount} confrontos informados (incluindo os adiados) e os pontos, vitórias e gols do snapshot. As posições usam pontos, vitórias, saldo e gols pró. Para empate de dois clubes, os resultados H2H concluídos de 2026 nos snapshots disponíveis são acumulados com os resultados simulados (pontos, saldo e gols marcados no confronto); placares individuais não foram conferidos contra a CBF. O REC também considera cartões e sorteio, ausentes dos dados. Empates ainda não resolvidos usam desempate uniforme reprodutível, então não há aplicação integral dos critérios oficiais.</p>
              <p>O backtest usa o limite dos primeiros 300 jogos em ordem cronológica como corte e as partidas seguintes como teste; kickoffs idênticos não são separados, portanto o tamanho do conjunto de teste pode variar. Médias, forças e frequências são estimadas sem jogos posteriores ao corte; a política anual de k usa somente os anos anteriores (2021 usa k=12 pré-fixado). Para 2026, k = {result.featureBacktest.productionShrinkageMatches} foi herdado da seleção walk-forward da temporada 2025 (escolhido apenas com os anos anteriores, entre {SHRINKAGE_CANDIDATES.join(', ')}); não há validação independente adicional. As ablações de casa/fora e H2H estão expostas acima; H2H não entra na previsão de 2026 porque não melhorou de modo consistente.</p>
              <p>A distribuição P(pontuação exata | resultado) conta clubes×simulação em cada total inteiro observado dentro de categorias finais exclusivas; cada valor exibe K/N, em que N é o total de clubes-simulações da categoria, e pontos com K=0 são omitidos. A curva separada P(resultado | pontuação exata) usa Libertadores 1º–5º e Sul-Americana 6º–11º. Nela, cada simulação é um cluster no IC de 95%, para não tratar os 20 clubes da mesma tabela como independentes. “Amostra baixa” significa intervalo com largura de ao menos {percent.format(POINT_CURVE_LOW_SAMPLE_WIDTH)}; resultados com K=0 não são estimados.</p>
              <p>As regras históricas eram: 1º campeão; 2º–6º Libertadores; 7º–12º Sul-Americana; 13º–16º meio; 17º–20º rebaixamento. Para 2026: 1º–4º Libertadores direta, 5º preliminar, 6º–11º Sul-Americana e quatro últimos rebaixados. Vagas de copas nacionais/CONMEBOL e suas redistribuições não são simuladas. O desempate usa pontos, vitórias, saldo e gols pró; o H2H 2026 disponível entra somente no desempate entre dois clubes, nunca nas probabilidades. H2H de 2021–2025 é exibido como contexto; cartões e sorteio não são simulados.</p>
              <p>O corte de projeção é {ANALYTICAL_CUTOFF_LOCAL.replace('T', ' ').replace('-03:00', ' BRT')} ({ANALYTICAL_CUTOFF_UTC}); a coleta é distinta: Football-Data, ESPN e página CBF foram capturados em {CURRENT_SEASON_SOURCE.cbfStandings.collectedAt.replace('T', ' ')}. O HTML CBF arquivado imprime “{CURRENT_SEASON_SOURCE.cbfStandings.displayedTimestamp}”; fuso e semântica de publicação/atualização não são indicados. A CBF foi usada somente para conferir agregados, não para validar resultados individuais. Dos {CURRENT_SEASON_SOURCE.footballData.rows2026} resultados de Football-Data, somam-se os placares ESPN com kickoffs anteriores ao corte, totalizando {seasonFacts.playedCount} resultados. Os snapshots e hashes estão em <code>data/source-snapshots/</code>. O calendário contém {seasonFacts.scheduledCount} jogos da tabela básica CBF, dos quais {seasonFacts.remainingCount} permanecem. Football-Data não informa fuso horário no campo Time e alerta para erros de compilação; é fonte secundária.</p>
              <p>Os 1.900 placares históricos foram empacotados com data/hora do CSV e ordinal original por temporada. O pacote histórico informa mtime local {HISTORICAL_SOURCE.localFileMtime} (metadado de arquivo, não timestamp de publicação) e SHA-256 <code className="source-hash">{HISTORICAL_SOURCE.sha256}</code>; a cópia bruta está preservada em <code>data/source-snapshots/football-data-BR.csv</code>, fora dos ativos de runtime. A CBF foi comparada apenas nos totais finais de pontos, jogos, vitórias, empates, derrotas e gols de 100 clubes-temporada, sem divergências; datas e placares não foram verificados jogo a jogo.</p>
              <p>Fontes: <a href={CBF_URL} target="_blank" rel="noreferrer">tabela CBF 2026</a> · <a href={FIXTURES_URL} target="_blank" rel="noreferrer">tabela básica CBF de jogos 2026</a> · <a href={REC_URL} target="_blank" rel="noreferrer">REC CBF 2026, arts. 6º–8º e 15</a> · <a href={HISTORICAL_URL} target="_blank" rel="noreferrer">Football-Data — placares históricos</a> · <a href="/brasileirao-2026/" className="text-link">auditoria de cálculos e dicionário de dados em docs/</a>.</p>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
