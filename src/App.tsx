import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { getZoneLabel, matchesClubFilter, scorers, standings, SCORERS_SOURCE, type ClubFilter, type Standing } from './data'
import { ProjectionSection } from './ProjectionSection'
import { ZoneLegend } from './ZoneLegend'
import { MethodologyPanel } from './MethodologyPanel'
import { ProjectionProvider, useProjection } from './ProjectionContext'
import { FixtureCalendar } from './FixtureCalendar'
import { ResultsTable } from './ResultsTable'
import { AuditPanel } from './AuditPanel'
import { StandingsViews } from './StandingsViews'
import { NextRoundPanel } from './NextRoundPanel'
import { TeamAnalysisPanel } from './TeamAnalysisPanel'
import { HeadToHeadPanel } from './HeadToHeadPanel'
import { espnLogoUrlByClub, currentClubs } from './projectionData'
import { useTableSort, type SortableColumn } from './useTableSort'
import { ZONES } from './projectionConfig'
import { seasonFacts, cutoffLabel, cutoffSummaryLine, scorersCaptureLabel, updateClock } from './seasonFacts'

const CBF_URL = 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026'
const ESPN_URL = 'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols'
const SCORERS_PER_PAGE = 20
type ThemeMode = 'system' | 'light' | 'dark'

const TABS = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'classificacoes', label: 'Classificações & Análises' },
  { id: 'jogos', label: 'Jogos & Confrontos' },
  { id: 'projecoes', label: 'Projeções & Simulador' },
  { id: 'metodologia', label: 'Metodologia & Auditoria' },
] as const

type TabId = (typeof TABS)[number]['id']

/** Âncoras legadas continuam abrindo a aba certa. */
const ANCHOR_TO_TAB: Record<string, TabId> = {
  '#inicio': 'visao-geral',
  '#classificacao': 'visao-geral',
  '#artilharia': 'visao-geral',
  '#clubes': 'visao-geral',
  '#classificacoes': 'classificacoes',
  '#jogos': 'jogos',
  '#calendario': 'jogos',
  '#resultados': 'jogos',
  '#confrontos': 'jogos',
  '#projecoes': 'projecoes',
  '#simulador': 'projecoes',
  '#probabilidades-time': 'projecoes',
  '#por-pontuacao': 'projecoes',
  '#estatisticas': 'metodologia',
  '#metodologia': 'metodologia',
  '#forcas-time': 'metodologia',
  '#dados': 'metodologia',
  '#auditoria': 'metodologia',
}

function tabFromHash(hash: string): TabId | null {
  if (hash === `#visao-geral` || hash === `#classificacoes` || hash === `#jogos` || hash === `#projecoes` || hash === `#metodologia` || hash === `#auditoria`) {
    const raw = hash.slice(1)
    return (raw === 'auditoria' ? 'metodologia' : raw) as TabId
  }
  return ANCHOR_TO_TAB[hash] ?? null
}

function getSavedTheme(): ThemeMode {
  try {
    const savedTheme = window.localStorage.getItem('br2026-theme')
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system'
  } catch {
    return 'system'
  }
}

function parseTheme(value: string): ThemeMode {
  if (value === 'light' || value === 'dark') return value
  return 'system'
}

const filters: { id: ClubFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'libertadores', label: 'Libertadores' },
  { id: 'sudamericana', label: 'Sul-Americana' },
  { id: 'sem-internacional', label: 'Sem competição internacional' },
  { id: 'relegation', label: 'Série B' },
]

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function zoneClass(position: number): string {
  if (position <= ZONES.libertadores.to) return 'qualification'
  if (position <= ZONES.sudamericana.to) return 'sudamericana'
  if (position >= ZONES.relegation.from) return 'relegation'
  return 'middle'
}

function SearchIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function BrandMark(): JSX.Element {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M20 2.5 35.2 11v18L20 37.5 4.8 29V11L20 2.5Z" />
        <path d="m20 9 8.7 5v12L20 31l-8.7-5V14L20 9Z" />
        <path d="M12 20h16M20 12v16" />
      </svg>
    </span>
  )
}

function TeamBadge({ team }: { team: Standing }): JSX.Element {
  const logo = espnLogoUrlByClub(team.club)
  const [failed, setFailed] = useState(false)
  if (logo && !failed) {
    return (
      <img
        className="team-badge team-badge--logo"
        src={logo}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return <span className="team-badge" aria-hidden="true">{team.initials}</span>
}

const standingsColumns: SortableColumn<Standing>[] = [
  { id: 'position', header: 'Pos', accessor: ({ position }) => position, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'points', header: 'Pts', accessor: ({ points }) => points, numeric: true },
  { id: 'played', header: 'J', accessor: ({ played }) => played, numeric: true },
]

function App(): JSX.Element {
  const [query, setQuery] = useState('')
  const [clubFilter, setClubFilter] = useState<ClubFilter>('all')
  const [theme, setTheme] = useState<ThemeMode>(getSavedTheme)
  const [activeTab, setActiveTab] = useState<TabId>('visao-geral')
  const [scorerPage, setScorerPage] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const leader = standings[0]!
  const leaderClub = currentClubs[0]!
  const normalizedQuery = normalizeText(query.trim())
  const scorerPageCount = Math.max(1, Math.ceil(scorers.length / SCORERS_PER_PAGE))
  const scorerPageStart = scorerPage * SCORERS_PER_PAGE
  const visibleScorers = scorers.slice(scorerPageStart, scorerPageStart + SCORERS_PER_PAGE)
  const scorerRangeStart = scorers.length === 0 ? 0 : scorerPageStart + 1
  const scorerRangeEnd = Math.min(scorerPageStart + SCORERS_PER_PAGE, scorers.length)

  const filteredStandings = useMemo(
    () => standings.filter((team) => normalizeText(team.club).includes(normalizedQuery)),
    [normalizedQuery],
  )
  const filteredClubs = useMemo(
    () => standings.filter((team) => matchesClubFilter(team.position, clubFilter)),
    [clubFilter],
  )
  const { sortedRows: sortedStandings, sortColumnId, direction, toggleSort, resetSort, ariaSort } = useTableSort(filteredStandings, standingsColumns, 'position')
  const isCustomStandingsSort = sortColumnId !== 'position' || direction !== 'ascending'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem('br2026-theme', theme)
    } catch {
      // A restricted browser can still use the selected theme for this visit.
    }
  }, [theme])

  const applyHash = useCallback((hash: string, shouldScroll: boolean) => {
    const tab = tabFromHash(hash)
    if (!tab) return
    setActiveTab(tab)
    if (!shouldScroll) return
    const target = document.getElementById(hash.slice(1))
    window.requestAnimationFrame(() => {
      // jsdom e leitores antigos não implementam scrollIntoView.
      if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    applyHash(window.location.hash, false)
    const onHashChange = (): void => applyHash(window.location.hash, true)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [applyHash])

  function selectTab(tab: TabId): void {
    setActiveTab(tab)
    // replaceState não dispara hashchange nem rola a página; apenas registra a aba na URL.
    window.history.replaceState(null, '', `#${tab}`)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const lastIndex = TABS.length - 1
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + TABS.length) % TABS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lastIndex
            : -1
    if (nextIndex < 0) return
    event.preventDefault()
    const nextTab = TABS[nextIndex]
    if (!nextTab) return
    selectTab(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Brasileirão 2026, início">
          <BrandMark />
          <span className="brand-copy"><strong>BRASILEIRÃO</strong><small>SÉRIE A · 2026</small></span>
        </a>
        <span className="season-pill"><span aria-hidden="true" /> TEMPORADA 2026</span>
      </header>

      <main id="conteudo">
        <ProjectionProvider>
        <section className="hero" id="inicio" aria-labelledby="hero-title">
          <div className="hero-pattern" aria-hidden="true" />
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-line" />CAMPEONATO BRASILEIRO · SÉRIE A</p>
              <h1 id="hero-title">O Brasileirão 2026<br /><em>em números.</em></h1>
              <p className="hero-description">Projeções Monte Carlo, probabilidades de vagas e auditoria de dados — base do modelo desde 2012 e retrospecto H2H desde 2003.</p>
              <a className="hero-link" href="#classificacao">Explorar classificação <span aria-hidden="true">↓</span></a>
            </div>
            <aside className="leader-card" aria-label="Líder da classificação">
              <div className="leader-card-top"><span>LÍDER DA TABELA</span>
                <span className="leader-rank">01 <small>/ 20</small></span>
              </div>
              <div className="leader-main">
                <TeamBadge team={leader} />
                <div><p>NA PONTA</p><h2>{leader.club}</h2></div>
              </div>
              <div className="leader-stats">
                <div><strong>{leader.points}</strong><span>Pontos</span></div>
                <div><strong>{leader.played}</strong><span>Jogos</span></div>
                <div><strong>{leaderClub.wins}</strong><span>Vitórias</span></div>
                <div><strong>{leaderClub.goalsFor - leaderClub.goalsAgainst > 0 ? `+${leaderClub.goalsFor - leaderClub.goalsAgainst}` : leaderClub.goalsFor - leaderClub.goalsAgainst}</strong><span>Saldo</span></div>
                <span className="leader-stat-caption sr-only">Classificação derivada do pacote</span>
              </div>
              <span className="leader-watermark" aria-hidden="true">26</span>
            </aside>
          </div>
          <div className="hero-foot"><span>20 CLUBES · UM CAMPEÃO</span><span>BRASIL <span aria-hidden="true">✳</span> 2026</span></div>
        </section>

        <section className="source-strip" aria-label="Fonte e horário dos dados">
          <div className="snapshot-summary">
            <span className="snapshot-badge">Snapshot automático</span>
            <div className="snapshot-copy">
              <p className="snapshot-state">Sem placares ao vivo — atualização automática a cada 2 horas.</p>
              <p>{cutoffSummaryLine}</p>
            </div>
          </div>
          <div className="source-strip-right">
            <div className="update-clock" aria-label="Relógio de atualização dos dados">
              <div><strong>Frescor</strong><span>{updateClock.daysSinceCutoff === 0 ? 'hoje' : updateClock.daysSinceCutoff === 1 ? 'ontem' : `${updateClock.daysSinceCutoff} dias atrás`}</span></div>
              <div><strong>Próxima verificação</strong><span>a cada 2 horas</span></div>
            </div>
            <a className="cbf-source" href={CBF_URL} target="_blank" rel="noreferrer">
              <img className="cbf-logo" src="https://www.cbf.com.br/logo/logo-verde.svg" alt="" aria-hidden="true" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />
              CBF <span aria-hidden="true">↗</span>
            </a>
            <label className="theme-control">
              <span>Tema</span>
              <select
                aria-label="Tema de exibição"
                value={theme}
                onChange={(event) => setTheme(parseTheme(event.currentTarget.value))}
              >
                <option value="system">Sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </label>
          </div>
        </section>

        <nav className="app-tabs" role="tablist" aria-label="Navegação principal">
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element }}
              className={activeTab === tab.id ? 'app-tab is-selected' : 'app-tab'}
              id={`aba-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={activeTab === tab.id}
              aria-controls={`painel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >{tab.label}</button>
          ))}
        </nav>

        <div className="content-wrap">
          <section id="painel-visao-geral" role="tabpanel" aria-labelledby="aba-visao-geral" hidden={activeTab !== 'visao-geral'}>
            <section className="kpi-strip" aria-label="Indicadores da temporada">
              <div className="kpi-card"><strong className="kpi-value">{leader.points}</strong><span className="kpi-label">Pontos do líder · {leader.club}</span></div>
              <div className="kpi-card"><strong className="kpi-value">{seasonFacts.playedCount}<span className="kpi-divider">/{seasonFacts.scheduledCount}</span></strong><span className="kpi-label">Jogos disputados no corte</span></div>
              <div className="kpi-card"><strong className="kpi-value">{ZONES.libertadores.to}</strong><span className="kpi-label">Vagas de Libertadores (1º–6º*)</span></div>
              <div className="kpi-card"><strong className="kpi-value">{seasonFacts.remainingCount}</strong><span className="kpi-label">Jogos restantes · rodadas + adiados</span></div>
            </section>

            <section className="dashboard-grid" id="classificacao" aria-labelledby="standings-title">
              <div className="standings-panel panel">
                <div className="section-heading">
                  <div><p className="eyebrow eyebrow-dark">A CORRIDA PELO TOPO</p><h2 id="standings-title">Classificação</h2></div>
                  <span className="section-index">01 <span>/ TABELA</span></span>
                </div>
                <div className="table-tools">
                  <label className="search-field">
                    <SearchIcon />
                    <span className="sr-only">Buscar clube na classificação</span>
                    <input
                      aria-label="Buscar clube na classificação"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder="Buscar clube..."
                    />
                  </label>
                  {isCustomStandingsSort && (
                    <button type="button" className="reset-sort-btn" onClick={resetSort} title="Restaurar ordenação oficial (1º ao 20º)">
                      ↺ Ordem oficial (1º–20º)
                    </button>
                  )}
                  <p className="result-count" aria-live="polite">
                    {filteredStandings.length} {filteredStandings.length === 1 ? 'clube encontrado' : 'clubes encontrados'}
                  </p>
                </div>
                <ZoneLegend ariaLabel="Legenda de zonas da classificação" describedBy="standings-g6-note" />
                <p className="zone-legend-note" id="standings-g6-note" role="note">* O G-6 é cenário adotado com redistribuição assumida; a vaga ao 6º não é automática apenas pela ida do Palmeiras à final da Copa do Brasil.</p>
                <div className="table-scroll" role="region" aria-label="Tabela classificatória; role para rolagem horizontal em telas pequenas" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        {standingsColumns.map((column) => (
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
                      {sortedStandings.map((team, index) => (
                        <tr className={`standing-row standing-row--${zoneClass(team.position)}`} key={team.club}>
                          <td className="position-cell"><span>{String(index + 1).padStart(2, '0')}</span></td>
                          <th scope="row" className="club-cell">
                            <TeamBadge team={team} />
                            <span className="club-cell-name">{team.club}</span>
                            {isCustomStandingsSort && (
                              <span className="official-pos-badge" title={`Posição oficial no campeonato: ${team.position}º`}>
                                {team.position}º oficial
                              </span>
                            )}
                            <span className="sr-only">Zona: {getZoneLabel(team.position)}</span>
                          </th>
                          <td className="points-cell numeric">{team.points}</td>
                          <td className="games-cell numeric">{team.played}</td>
                        </tr>
                      ))}
                      {sortedStandings.length === 0 && (
                        <tr><td className="empty-state" colSpan={4}>Nenhum clube encontrado. Tente outro nome.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <details className="clean-disclosure">
                  <summary>ℹ️ Notas de conciliação de dados</summary>
                  <p className="table-note">Classificação calculada dos resultados do pacote; a cópia CBF arquivada soma 332 jogos e não valida este conjunto. O número de jogos varia entre os clubes.</p>
                </details>
              </div>

              <section className="scorers-panel panel" id="artilharia" aria-labelledby="scorers-title">
                <div className="section-heading">
                  <div><p className="eyebrow eyebrow-dark">QUEM FAZ A DIFERENÇA</p><h2 id="scorers-title">Artilharia</h2></div>
                  <span className="section-index">02 <span>/ GOLS</span></span>
                </div>
                <ol className="scorer-list" id="scorer-list" aria-label="Artilharia">
                  {visibleScorers.map((scorer, index) => (
                    <li className="scorer-item" key={`${scorer.name}-${scorer.club}`}>
                      <span className="scorer-rank">{scorer.position}</span>
                      <span className={`scorer-avatar scorer-avatar--${scorerPageStart + index + 1}`} aria-hidden="true">{scorer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                      <span className="scorer-info"><strong>{scorer.name}</strong><small>{scorer.club}</small></span>
                      <span className="goal-count"><strong>{scorer.goals}</strong><small>gols</small></span>
                    </li>
                  ))}
                </ol>
                <nav className="scorer-pagination" aria-label="Paginação da artilharia">
                  <button
                    className="filter-button"
                    type="button"
                    aria-label="Página anterior da artilharia"
                    aria-controls="scorer-list"
                    disabled={scorerPage === 0}
                    onClick={() => setScorerPage((page) => Math.max(0, page - 1))}
                  >Anterior</button>
                  <button
                    className="filter-button"
                    type="button"
                    aria-label="Próxima página da artilharia"
                    aria-controls="scorer-list"
                    disabled={scorerPage >= scorerPageCount - 1}
                    onClick={() => setScorerPage((page) => Math.min(scorerPageCount - 1, page + 1))}
                  >Próxima</button>
                  <span className="scorer-pagination-status" aria-live="polite" aria-atomic="true">
                    <span>{scorerRangeStart}–{scorerRangeEnd} de {scorers.length}</span>
                    <span aria-current="page">Página {scorerPage + 1} de {scorerPageCount}</span>
                  </span>
                </nav>
                <details className="clean-disclosure">
                  <summary>ℹ️ Fontes e critérios da artilharia</summary>
                  <p className="scorers-caption">Lista informativa da temporada; captura pós-corte, não representa a artilharia no corte.</p>
                  <p className="scorers-source-note">Fonte: {SCORERS_SOURCE.name} · captura {scorersCaptureLabel} · posterior ao corte analítico; sem timestamp por partida, cobertura temporal não verificada. Σgols de atletas ≈ gols da tabela menos gols contra.</p>
                  <div className="tie-note"><span aria-hidden="true">↗</span> Posições empatadas exibidas sem exclusões.</div>
                </details>
                <a className="text-link" href={ESPN_URL} target="_blank" rel="noreferrer">Ver estatísticas na ESPN <span aria-hidden="true">↗</span></a>
              </section>
            </section>

            <section className="clubs-section" id="clubes" aria-labelledby="clubs-title">
              <div className="clubs-heading">
                <div><p className="eyebrow eyebrow-dark">OS PROTAGONISTAS</p><h2 id="clubs-title">Clubes da Série A</h2></div>
                <p>Vinte histórias, uma só disputa.<br />Filtre pela faixa da tabela.</p>
              </div>
              <div className="club-filters" role="group" aria-label="Filtrar clubes por zona da tabela">
                {filters.map((filter) => (
                  <button
                    aria-pressed={clubFilter === filter.id}
                    className={clubFilter === filter.id ? 'filter-button is-selected' : 'filter-button'}
                    key={filter.id}
                    onClick={() => setClubFilter(filter.id)}
                    type="button"
                  >{filter.label}</button>
                ))}
                <span className="filter-count" aria-live="polite">{filteredClubs.length} clubes</span>
              </div>
              <ul className="club-list" aria-label="Clubes filtrados por zona">
                {filteredClubs.map((team) => (
                  <li className={`club-card club-card--${zoneClass(team.position)}`} key={team.club}>
                    <span className="club-card-position">{String(team.position).padStart(2, '0')}</span>
                    <TeamBadge team={team} />
                    <span className="club-card-name">{team.club}</span>
                    <span className="club-card-points">{team.points}<small> PTS</small></span>
                  </li>
                ))}
              </ul>
            </section>
          </section>

          <section id="painel-classificacoes" role="tabpanel" aria-labelledby="aba-classificacoes" hidden={activeTab !== 'classificacoes'}>
            <StandingsViews />
          </section>

          <section id="painel-jogos" role="tabpanel" aria-labelledby="aba-jogos" hidden={activeTab !== 'jogos'}>
            <NextRoundPanel />
            <ResultsTable />
            <FixtureCalendar />
            <TeamAnalysisPanel />
            <HeadToHeadPanel />
            <div id="painel-confrontos" hidden={activeTab !== 'jogos'} />
          </section>

          <section id="painel-projecoes" role="tabpanel" aria-labelledby="aba-projecoes" hidden={activeTab !== 'projecoes'}>
            <ProjectionSection />
          </section>

          <section id="painel-metodologia" role="tabpanel" aria-labelledby="aba-metodologia" hidden={activeTab !== 'metodologia'}>
            <MethodologyConsumer />
            <AuditPanel />
            <div id="painel-dados" hidden={activeTab !== 'metodologia'} />
          </section>
        </div>
        </ProjectionProvider>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><BrandMark /><strong>BRASILEIRÃO <span>2026</span></strong></div>
        <p>Snapshot estático · Simulações em segundo plano · Sem dados ao vivo.</p>
        <div className="footer-sources"><a href={CBF_URL} target="_blank" rel="noreferrer"><img className="cbf-logo" src="https://www.cbf.com.br/logo/logo-verde.svg" alt="" aria-hidden="true" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> CBF · Página atual de classificação ↗</a><a href={ESPN_URL} target="_blank" rel="noreferrer">ESPN · Consulta externa ↗</a></div>
        <small>Corte analítico dos resultados: {cutoffLabel}. A classificação local é derivada do pacote, não uma classificação CBF oficial; o HTML CBF arquivado soma 332 jogos e não valida o conjunto. A página atual consultada em 08/11 é pós-corte. Artilharia: {SCORERS_SOURCE.name}, captura {scorersCaptureLabel}, posterior ao corte; sem timestamp por partida, cobertura temporal não verificada.</small>
      </footer>
    </>
  )
}

/** Consome o worker compartilhado (um run para Projeções e Metodologia). */
function MethodologyConsumer(): JSX.Element {
  const { result, status, retry } = useProjection()
  return <MethodologyPanel result={result} status={status} onRetry={retry} />
}

export default App
