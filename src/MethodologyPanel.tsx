import { useMemo, type JSX } from 'react'
import { POINT_CURVE_LOW_SAMPLE_WIDTH, SHRINKAGE_CANDIDATES, SIMULATION_SEED, XG_BLEND_CANDIDATES, XG_BLEND_WEIGHT } from './projectionConfig'
import { estimateExpectedGoals, type ProjectionResult } from './projection'
import { HISTORICAL_SOURCE } from './historicalSeasons'
import { CURRENT_SEASON_PACK_GENERATED_AT, CURRENT_SEASON_SOURCE } from './currentSeasonResults'
import { ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'
import { productionTrainingMatches, productionXgMatches, runXgBlendAblation } from './modelBacktest'
import { expectedGoalsBreakdown, expectedGoalsFromXg, teamStrengthTable, historicalGoalAverages } from './matchModel'
import { currentClubs, remainingFixtures } from './projectionData'
import { seasonFacts, historicalFacts, cutoffLabel } from './seasonFacts'
import { ADVANCED_STATS_SOURCE, advancedMatches } from './advancedStats2026'
import type { ProjectionStatus } from './ProjectionContext'

const CBF_URL = 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026'
const FIXTURES_URL = 'https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_BA_sica_Brasileiro_SA_rie_A_2026_d64996b4d8.pdf'
const REC_URL = 'https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf'
const HISTORICAL_URL = 'https://www.football-data.co.uk/new/BR.csv'

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

/** Ablação do blend xG × gols: Brier por peso candidato (walk-forward por rodada de 2026). */
function XgBlendBlock(): JSX.Element | null {
  const ablation = useMemo(() => runXgBlendAblation(), [])
  const sortedWeights = [...XG_BLEND_CANDIDATES]
  const productionWeight = ablation.eligible ? XG_BLEND_WEIGHT : 0
  if (ablation.rounds.length === 0) return null
  const coveredClubs = new Set(advancedMatches.flatMap(({ home, away }) => [home, away])).size
  const productionUsesXg = productionWeight > 0 && ablation.brierByWeight.get(productionWeight)! < ablation.brierByWeight.get(0)!

  return (
    <section className="projection-block ablation-block" aria-labelledby="xg-title">
      <div className="projection-block-heading">
        <div><p className="eyebrow eyebrow-dark">xG × GOLS</p><h3 id="xg-title">Blend xG × gols — teste walk-forward por rodada de 2026</h3></div>
        <span>{ADVANCED_STATS_SOURCE.name} · menor Brier é melhor</span>
      </div>
      <p className="projection-table-note">
        Gols são eventos raros; o xG soma a qualidade de todas as chances. Recalculamos as taxas de ataque/defesa da
        temporada em xG ({ablation.coveredMatches} jogos com cobertura, {coveredClubs} clubes) e misturamos com o
        modelo de gols da base longa: λ final = (1−w)·λ<sub>gols</sub> + w·λ<sub>xG</sub>. O teste treina até a rodada
        t−1 (o xG da própria rodada nunca entra) e mede o Brier de resultado H/empate/F na rodada t, acumulado sobre
        {' '}{ablation.rounds.length} rodadas. Pesos 0 e 1 delimitam os modelos puros. A fonte é o snapshot 365scores
        capturado em 2026-11-07T15:25:20.960Z, após o corte analítico, sem timestamp temporal por partida. Assim,
        t−1 descreve apenas a separação das rodadas neste cálculo walk-forward: não comprova que o xG de cada partida
        estivesse disponível até aquela rodada ou no corte.
      </p>
      <div className="table-scroll projection-table-scroll" role="region" aria-label="Brier do blend xG por peso" tabIndex={0}>
        <table className="projection-table backtest-table ablation-table">
          <thead><tr><th scope="col">PESO DO xG (w)</th><th scope="col" className="numeric">BRIER ACUMULADO</th><th scope="col" className="numeric">DIFERENÇA VS SÓ GOLS</th></tr></thead>
          <tbody>
            {sortedWeights.map((weight) => {
              const brier = ablation.brierByWeight.get(weight)
              if (brier == null) return null
              const delta = brier - ablation.brierByWeight.get(0)!
              const isBest = weight === ablation.bestWeight
              return (
                <tr key={weight} className={isBest ? 'xg-row--best' : undefined}>
                  <th scope="row">{weight === 0 ? '0 (só gols)' : weight === 1 ? '1 (só xG)' : decimal.format(weight)}{isBest ? ' · melhor' : ''}</th>
                  <td className="numeric">{decimal.format(brier)}</td>
                  <td className="numeric">{delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${decimal.format(delta)}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="projection-table-note">
        {productionWeight > 0 && ablation.eligible
          ? `Produção usa w = ${decimal.format(productionWeight)}${productionUsesXg ? ` — melhora o Brier de só gols (${decimal.format(ablation.brierByWeight.get(0)!)} → ${decimal.format(ablation.brierByWeight.get(productionWeight)!)})` : ' (peso fixo; empate técnico com só gols neste corte)'}.`
          : 'Produção segue só em gols: o peso do xG não melhorou o Brier walk-forward de forma consistente neste corte.'}
        {ablation.unmatchedMatches > 0 && ` ${ablation.unmatchedMatches} jogo(s) da fonte ficaram fora do calendário e entram só na próxima coleta.`}
        Confira a auditoria §18 para o protocolo completo e o histórico da decisão.
      </p>
    </section>
  )
}

function NumericExample({ result }: { result: ProjectionResult }): JSX.Element {
  const example = useMemo(() => {
    const fixture = remainingFixtures[0]!
    const k = result.featureBacktest.productionShrinkageMatches
    const breakdown = expectedGoalsBreakdown(fixture.home, fixture.away, productionTrainingMatches, 2026, k)
    const xgAblation = runXgBlendAblation()
    const xgExpected = xgAblation.eligible ? expectedGoalsFromXg(fixture.home, fixture.away, productionXgMatches, k) : null
    const weight = xgAblation.eligible ? XG_BLEND_WEIGHT : 0
    const production = estimateExpectedGoals(fixture.home, fixture.away)
    return { fixture, k, breakdown, xgExpected, weight, production }
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
        <li><strong>Base de treino:</strong> média de gols por mando na base efetiva — μ<sub>casa</sub> = {decimal.format(averages.home)}, μ<sub>fora</sub> = {decimal.format(averages.away)} (histórico {historicalFacts.firstYear}–{historicalFacts.lastYear} + {seasonFacts.playedCount} jogos de 2026 até o corte).</li>
        <li><strong>Força de {home} em casa:</strong> taxa de ataque regularizada = {decimal.format(homeAttackRate)} gols/jogo (média da liga como mandante: {decimal.format(averages.home)}).</li>
        <li><strong>Defesa de {away} fora:</strong> taxa de gols sofridos como visitante = {decimal.format(awayDefenseRate)} gols/jogo.</li>
        <li><strong>Decomposição em gols:</strong> λ<sub>{home}</sub> = μ<sub>casa</sub> × (ataque<sub>{home}</sub>/μ<sub>casa</sub>) × (defesa<sub>{away}</sub>/μ<sub>casa</sub>) = {decimal.format(averages.home)} × ({decimal.format(homeAttackRate)}/{decimal.format(averages.home)}) × ({decimal.format(awayDefenseRate)}/{decimal.format(averages.home)}) = {decimal.format(expected.home)}.</li>
        {example.xgExpected && example.weight > 0 ? (
          <li><strong>Blend com xG:</strong> λ<sub>{home}</sub> = (1−w)·λ<sub>gols</sub> + w·λ<sub>xG</sub> = (1−{decimal.format(example.weight)})·{decimal.format(expected.home)} + {decimal.format(example.weight)}·{decimal.format(example.xgExpected.home)} = <strong>{decimal.format(example.production.home)}</strong> (λ<sub>xG</sub> de {away} = {decimal.format(example.xgExpected.away)}). Este é o λ exibido no painel de Confrontos.</li>
        ) : (
          <li><strong>Resultado:</strong> λ de {home} = {decimal.format(expected.home)} e λ de {away} = {decimal.format(expected.away)} alimentam duas Poisson independentes; os marginais H/E/F viram as barras do painel de Confrontos.</li>
        )}
      </ol>
      <p className="projection-table-note">Piso de 0,05 aplicado a cada λ; encadeamento idêntico ao usado nos 48 confrontos da simulação.</p>
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
          <p className="projection-lead">Fórmulas em execução, validação walk-forward {historicalFacts.firstYear}–{historicalFacts.lastYear}, forças por clube e um exemplo numérico rastreável — tudo derivado dos dados empacotados, sem números manuais.</p>
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
              <div><p className="eyebrow eyebrow-dark">VALIDAÇÃO TEMPORAL</p><h3 id="backtest-title">Backtest walk-forward {historicalFacts.firstYear}–{historicalFacts.lastYear}</h3></div>
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
              <div><p className="eyebrow eyebrow-dark">TESTE DE RECURSOS</p><h3 id="ablation-title">Ablation walk-forward {historicalFacts.firstYear}–{historicalFacts.lastYear}</h3></div>
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

          <XgBlendBlock />
          <StrengthTable result={result} />
          <NumericExample result={result} />

          <details className="projection-method" open>
            <summary>Fórmula, regras, dados e limitações</summary>
            <div className="method-copy">
              <h3>Método de gols esperados</h3>
              <p>Na base de treino efetiva ({historicalFacts.totalMatches} placares de {historicalFacts.firstYear}–{historicalFacts.lastYear} mais os {seasonFacts.playedCount} resultados de 2026 até o corte), μ<sub>casa</sub> = {decimal.format(result.trainingGoalAverages.home)} e μ<sub>fora</sub> = {decimal.format(result.trainingGoalAverages.away)} são as médias por mando usadas pelo modelo; no histórico puro de {historicalFacts.firstYear}–{historicalFacts.lastYear}, μ<sub>casa</sub> = {decimal.format(result.leagueAverageGoals.home)} e μ<sub>fora</sub> = {decimal.format(result.leagueAverageGoals.away)}. Para cada clube e mando v, as taxas de ataque e gols sofridos usam (gols 2026<sub>c,v</sub> + k × taxa histórica<sub>c,v</sub>)/(jogos 2026<sub>c,v</sub> + k), com k = {result.featureBacktest.productionShrinkageMatches}. As taxas históricas específicas por clube/mando são ponderadas por recência (meia-vida de 2,5 temporadas) e regularizadas para a média da liga com 20 jogos ponderados prévios. λ<sub>casa</sub> = μ<sub>casa</sub> × ataque<sub>mandante,casa</sub>/μ<sub>casa</sub> × defesa<sub>visitante,fora</sub>/μ<sub>casa</sub>; λ<sub>fora</sub> = μ<sub>fora</sub> × ataque<sub>visitante,fora</sub>/μ<sub>fora</sub> × defesa<sub>mandante,casa</sub>/μ<sub>fora</sub>. Placares são amostrados de Poisson independentes.</p>
              <p>Foram simulados {integer.format(result.simulations)} campeonatos com semente fixa {SIMULATION_SEED}; cada um incorpora os {seasonFacts.remainingCount} confrontos informados (incluindo os adiados) e os pontos, vitórias e gols do snapshot.</p>
              <p><strong>Norma oficial:</strong> o Art. 15 do REC 2026 prevê pontos, vitórias, saldo de gols, gols pró, confronto direto, menos cartões vermelhos, menos cartões amarelos e sorteio, nessa ordem. No confronto direto entre dois clubes, somam-se os pontos dos jogos de ida e volta e, depois, compara-se o saldo; para três ou mais clubes, o confronto direto não se aplica.</p>
              <p><strong>Comparador analítico implementado:</strong> após pontos, vitórias, saldo e gols pró, o empate entre dois clubes é comparado pelo H2H disponível em pontos, saldo e gols pró (jogos reais e simulados); se persistir, há sorteio antes dos cartões. Para três ou mais clubes, usa disciplina estimada — cartões reais disponíveis no snapshot 365scores e cartões projetados pela taxa por jogo, não simulados partida a partida. Portanto, o comparador não reproduz integralmente o Art. 15 nem certifica uma classificação oficial. Placares individuais não foram conferidos contra a CBF.</p>
              <p><strong>Limite temporal:</strong> o snapshot 365scores que contém os cartões foi capturado após o corte analítico 2026-11-07T00:58:14.422Z e não tem cobertura temporal por partida suficiente para confirmar o estado dos cartões naquele corte. Esses valores não certificam o desempate oficial no corte.</p>
              <p>O backtest usa o limite dos primeiros 300 jogos em ordem cronológica como corte e as partidas seguintes como teste; kickoffs idênticos não são separados, portanto o tamanho do conjunto de teste pode variar. Médias, forças e frequências são estimadas sem jogos posteriores ao corte; a política anual de k usa somente os anos anteriores (2021 usa k=12 pré-fixado). Para 2026, k = {result.featureBacktest.productionShrinkageMatches} foi herdado da seleção walk-forward da temporada 2025 (escolhido apenas com os anos anteriores, entre {SHRINKAGE_CANDIDATES.join(', ')}); não há validação independente adicional. As ablações de casa/fora e H2H estão expostas acima; H2H não entra na previsão de 2026 porque não melhorou de modo consistente.</p>
              <p>A distribuição P(pontuação exata | resultado) conta clubes×simulação em cada total inteiro observado dentro de categorias finais exclusivas; cada valor exibe K/N, em que N é o total de clubes-simulações da categoria, e pontos com K=0 são omitidos. A curva separada P(resultado | pontuação exata) usa Libertadores 1º–5º e Sul-Americana 6º–11º. Nela, cada simulação é um cluster no IC de 95%, para não tratar os 20 clubes da mesma tabela como independentes. “Amostra baixa” significa intervalo com largura de ao menos {percent.format(POINT_CURVE_LOW_SAMPLE_WIDTH)}; resultados com K=0 não são estimados.</p>
              <p>Por que nossos números podem diferir de outros sites: (1) o núcleo do modelo é Poisson com forças casa/fora de 2012–2026 <strong>em gols</strong> — quando o blend de xG está ativo (bloco acima), ele corrige a leitura da temporada sem substituir a base longa, mas sites com xG de outras provedoras ou odds de mercado ainda podem divergir; (2) cartões no desempate são <strong>projetados pela taxa média do clube</strong> (não simulados jogo a jogo), então empates de três ou mais clubes que os cartões não resolvem caem no sorteio reprodutível; (3) com 500.000 simulações, o ruído de Monte Carlo é de ±0,14 p.p. em probabilidades próximas de 50%. O exemplo do Vasco na rodada 34: com 41 pts e 5 jogos (Chape fora, Inter em casa, Bragantino fora, Atlético-MG fora, Vitória em casa), a mediana simulada foi 48 pts e o rebaixamento 2,47% — a vitória por 3–1 sobre o Athletico-PR derrubou o número de ~7% para 2,47% na atualização seguinte.</p>
              <p>As regras históricas eram: 1º campeão; 2º–6º Libertadores; 7º–12º Sul-Americana; 13º–16º meio; 17º–20º rebaixamento. Para 2026: 1º–4º Libertadores direta, 5º preliminar, 6º–11º Sul-Americana e quatro últimos rebaixados. Vagas de copas nacionais/CONMEBOL e suas redistribuições não são simuladas. H2H de {historicalFacts.firstYear}–{historicalFacts.lastYear} é exibido apenas como contexto.</p>
              <p>O corte analítico de resultados e projeções é {cutoffLabel} ({ANALYTICAL_CUTOFF_UTC}); o pacote foi gerado em {CURRENT_SEASON_PACK_GENERATED_AT}. A captura individual de Football-Data, ESPN e página CBF não foi registrada. O HTML CBF arquivado imprime “{CURRENT_SEASON_SOURCE.cbfStandings.displayedTimestamp}”; fuso e semântica de publicação/atualização não são indicados. Sua tabela soma 332 jogos e não valida o pacote atual nem confere placares individuais. O CSV Football-Data contém {CURRENT_SEASON_SOURCE.footballData.rows2026} linhas de 2026; aplicando o corte conservador e complementando com placares ESPN elegíveis pelo kickoff, o pacote contém {seasonFacts.playedCount} resultados. Os snapshots e hashes estão em <code>data/source-snapshots/</code>. O calendário contém {seasonFacts.scheduledCount} jogos da tabela básica CBF, dos quais {seasonFacts.remainingCount} permanecem. Football-Data não informa fuso horário no campo Time e alerta para erros de compilação; é fonte secundária.</p>
              <p>Os {historicalFacts.totalMatches} placares históricos ({historicalFacts.seasons} temporadas, {historicalFacts.firstYear}–{historicalFacts.lastYear}) foram empacotados com data/hora do CSV e ordinal original por temporada. A validação agregada contra tabelas finais CBF cobre {historicalFacts.verifiedRange}; as temporadas anteriores não foram verificadas contra fonte independente. O pacote histórico informa mtime local {HISTORICAL_SOURCE.localFileMtime} (metadado de arquivo, não timestamp de publicação) e SHA-256 <code className="source-hash">{HISTORICAL_SOURCE.sha256}</code>; a cópia bruta está preservada em <code>data/source-snapshots/football-data-BR.csv</code>, fora dos ativos de runtime.</p>
              <p>Fontes: <a href={CBF_URL} target="_blank" rel="noreferrer">tabela CBF 2026</a> · <a href={FIXTURES_URL} target="_blank" rel="noreferrer">tabela básica CBF de jogos 2026</a> · <a href={REC_URL} target="_blank" rel="noreferrer">REC CBF 2026, arts. 6º–8º e 15</a> · <a href={HISTORICAL_URL} target="_blank" rel="noreferrer">Football-Data — placares históricos</a> · <a href="/brasileirao-2026/" className="text-link">auditoria de cálculos e dicionário de dados em docs/</a>.</p>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
