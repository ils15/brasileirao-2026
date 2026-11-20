import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { getZoneLabel, matchesClubFilter, scorers, standings, SCORERS_SOURCE, zoneLabelsFor, type ClubFilter, type Standing } from './data'
import { ScorersPanel } from './ScorersPanel'
import { InfoIcon } from './icons'
import { ZoneLegend } from './ZoneLegend'
import { ProjectionProvider, useProjection } from './ProjectionContext'
import { AsyncStatus } from './AsyncStatus'
import { espnLogoUrlByClub, currentClubs } from './projectionData'
import { useTableSort, type SortableColumn } from './useTableSort'
import { ZONES, resolveLibertadoresZones, type LibertadoresZones } from './projectionConfig'
import { seasonFacts, cutoffLabel, cutoffSummaryLine, scorersCaptureLabel, scorersCaptureRelation, scorersCoverageNote, updateClock, cbfArchiveProvenance, formatUtcIso } from './seasonFacts'
import { buildInfo } from './buildInfo'

/**
 * Abas pesadas são carregadas sob demanda: Jogos & Confrontos (NextRoundPanel
 * dispara o backtest walk-forward no render), Projeções (section inteira),
 * Metodologia (backtest + auditoria) e Classificações (tabelas derivadas).
 * A Visão Geral permanece síncrona para o primeiro paint não pagar Suspense.
 */
const ClassificacoesTab = lazy(() => import('./ClassificacoesTab').then((module) => ({ default: module.ClassificacoesTab })))
const JogosTab = lazy(() => import('./JogosTab').then((module) => ({ default: module.JogosTab })))
const ProjecoesTab = lazy(() => import('./ProjecoesTab').then((module) => ({ default: module.ProjecoesTab })))
const MetodologiaTab = lazy(() => import('./MetodologiaTab').then((module) => ({ default: module.MetodologiaTab })))

function TabLoading({ label }: { label: string }): JSX.Element {
  return <AsyncStatus phase="loading" message={`Carregando ${label}…`} />
}

const CBF_URL = 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026'
const ESPN_URL = 'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols'
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

/**
 * Marcador de aba pronta: fica dentro do Suspense, então só monta quando o
 * chunk lazy resolve — é o sinal que tira o `aria-busy` do tabpanel.
 */
function TabReady({ tab, onReady }: { tab: TabId; onReady: (tab: TabId) => void }): null {
  useEffect(() => {
    onReady(tab)
  }, [onReady, tab])
  return null
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

function zoneClass(position: number, zones?: LibertadoresZones): string {
  if (position <= (zones?.libertadoresTo ?? ZONES.libertadores.to)) return 'qualification'
  if (position <= (zones?.sudamericanaTo ?? ZONES.sudamericana.to)) return 'sudamericana'
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

/**
 * Zonas efetivas dentro do ProjectionProvider: o resultado do worker manda
 * enquanto existir (reflete o cenário simulado); sem resultado, o próprio
 * cenário selecionado resolve as fronteiras — G-6 no default.
 */
function useActiveZones(): LibertadoresZones {
  const { result, scenario } = useProjection()
  return result?.libertadoresZones ?? resolveLibertadoresZones(scenario)
}

/** KPI da visão geral com a linha da Libertadores do cenário ativo. */
function LibertadoresSlotsKpi(): JSX.Element {
  const zones = useActiveZones()
  return (
    <div className="kpi-card"><strong className="kpi-value">{zones.libertadoresTo}</strong><span className="kpi-label">Vagas de Libertadores (1º–{zones.libertadoresTo}º)</span></div>
  )
}

/** Legenda de zonas da classificação presa ao cenário ativo. */
function StandingsZonesLegend(): JSX.Element {
  const zones = useActiveZones()
  const labels = zoneLabelsFor(zones)
  return (
    <>
      <ZoneLegend ariaLabel="Legenda de zonas da classificação" describedBy="standings-zone-legend-note" zones={zones} />
      <p className="zone-legend-note" id="standings-zone-legend-note" role="note">
        Linha da Libertadores: {labels.libertadores.detail}; Sul-Americana {labels.sudamericana.range}. A linha desliza quando uma vaga das copas volta à tabela — ajuste o cenário em Projeções & Simulador.
      </p>
    </>
  )
}

/** Linha da classificação da visão geral com zona e rótulo acessível dinâmicos. */
function OverviewStandingsRow({ team, index, customSort }: { team: Standing; index: number; customSort: boolean }): JSX.Element {
  const zones = useActiveZones()
  return (
    <tr className={`standing-row standing-row--${zoneClass(team.position, zones)}`}>
      <td className="position-cell"><span>{String(index + 1).padStart(2, '0')}</span></td>
      <th scope="row" className="club-cell">
        <TeamBadge team={team} />
        <span className="club-cell-name">{team.club}</span>
        {customSort && (
          <span className="official-pos-badge" title={`Posição oficial no campeonato: ${team.position}º`}>
            {team.position}º oficial
          </span>
        )}
        <span className="sr-only">Zona: {getZoneLabel(team.position, zones)}</span>
      </th>
      <td className="points-cell numeric">{team.points}</td>
      <td className="games-cell numeric">{team.played}</td>
    </tr>
  )
}

function App(): JSX.Element {
  const [query, setQuery] = useState('')
  const [clubFilter, setClubFilter] = useState<ClubFilter>('all')
  const [theme, setTheme] = useState<ThemeMode>(getSavedTheme)
  const [activeTab, setActiveTab] = useState<TabId>('visao-geral')
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['visao-geral']))
  // `visao-geral` é síncrona: já nasce pronta. As lazy entram quando o marcador monta.
  const [readyTabs, setReadyTabs] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['visao-geral']))
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const leader = standings[0]!
  const leaderClub = currentClubs[0]!
  const normalizedQuery = normalizeText(query.trim())

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

  // Aba visitada continua montada (estado local preservado ao trocar de aba),
  // mas nunca é montada antes da primeira visita — é o que mantém o boot leve.
  useEffect(() => {
    setVisitedTabs((current) => (current.has(activeTab) ? current : new Set(current).add(activeTab)))
  }, [activeTab])

  const isTabMounted = (tab: TabId): boolean => tab === activeTab || visitedTabs.has(tab)
  /** Aba ativa sem chunk montado fica `aria-busy`; aba oculta não declara estado. */
  const isTabBusy = (tab: TabId): boolean | undefined => (activeTab === tab ? !readyTabs.has(tab) : undefined)
  const markTabReady = useCallback((tab: TabId) => {
    setReadyTabs((current) => (current.has(tab) ? current : new Set(current).add(tab)))
  }, [])
  const projectionTabsActive = activeTab === 'projecoes' || activeTab === 'metodologia'

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
        <ProjectionProvider enabled={projectionTabsActive}>
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
          <section id="painel-visao-geral" role="tabpanel" aria-labelledby="aba-visao-geral" aria-busy={isTabBusy('visao-geral')} hidden={activeTab !== 'visao-geral'}>
            <section className="kpi-strip" aria-label="Indicadores da temporada">
              <div className="kpi-card"><strong className="kpi-value">{leader.points}</strong><span className="kpi-label">Pontos do líder · {leader.club}</span></div>
              <div className="kpi-card"><strong className="kpi-value">{seasonFacts.playedCount}<span className="kpi-divider">/{seasonFacts.scheduledCount}</span></strong><span className="kpi-label">Jogos disputados no corte</span></div>
              <LibertadoresSlotsKpi />
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
                <StandingsZonesLegend />
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
                        <OverviewStandingsRow key={team.club} team={team} index={index} customSort={isCustomStandingsSort} />
                      ))}
                      {sortedStandings.length === 0 && (
                        <tr><td className="empty-state" colSpan={4}>Nenhum clube encontrado. Tente outro nome.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <details className="clean-disclosure">
                  <summary><InfoIcon className="inline-icon" /> Notas de conciliação de dados</summary>
                  <p className="table-note">Classificação calculada dos resultados do pacote; {cbfArchiveProvenance}. O número de jogos varia entre os clubes.</p>
                </details>
              </div>

              <ScorersPanel scorers={scorers} source={SCORERS_SOURCE} />
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

          <section id="painel-classificacoes" role="tabpanel" aria-labelledby="aba-classificacoes" aria-busy={isTabBusy('classificacoes')} hidden={activeTab !== 'classificacoes'}>
            {isTabMounted('classificacoes') && (
              <Suspense fallback={<TabLoading label="classificações" />}>
                <ClassificacoesTab />
                <TabReady tab="classificacoes" onReady={markTabReady} />
              </Suspense>
            )}
          </section>

          <section id="painel-jogos" role="tabpanel" aria-labelledby="aba-jogos" aria-busy={isTabBusy('jogos')} hidden={activeTab !== 'jogos'}>
            {isTabMounted('jogos') && (
              <Suspense fallback={<TabLoading label="jogos e confrontos" />}>
                <JogosTab />
                <TabReady tab="jogos" onReady={markTabReady} />
              </Suspense>
            )}
            <div id="painel-confrontos" hidden={activeTab !== 'jogos'} />
          </section>

          <section id="painel-projecoes" role="tabpanel" aria-labelledby="aba-projecoes" aria-busy={isTabBusy('projecoes')} hidden={activeTab !== 'projecoes'}>
            {isTabMounted('projecoes') && (
              <Suspense fallback={<TabLoading label="projeções" />}>
                <ProjecoesTab />
                <TabReady tab="projecoes" onReady={markTabReady} />
              </Suspense>
            )}
          </section>

          <section id="painel-metodologia" role="tabpanel" aria-labelledby="aba-metodologia" aria-busy={isTabBusy('metodologia')} hidden={activeTab !== 'metodologia'}>
            {isTabMounted('metodologia') && (
              <Suspense fallback={<TabLoading label="metodologia e auditoria" />}>
                <MetodologiaTab />
                <TabReady tab="metodologia" onReady={markTabReady} />
              </Suspense>
            )}
            <div id="painel-dados" hidden={activeTab !== 'metodologia'} />
          </section>
        </div>
        </ProjectionProvider>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><BrandMark /><strong>BRASILEIRÃO <span>2026</span></strong></div>
        <p>Snapshot estático · Simulações em segundo plano · Sem dados ao vivo.</p>
        <div className="footer-sources"><a href={CBF_URL} target="_blank" rel="noreferrer"><img className="cbf-logo" src="https://www.cbf.com.br/logo/logo-verde.svg" alt="" aria-hidden="true" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> CBF · Página atual de classificação ↗</a><a href={ESPN_URL} target="_blank" rel="noreferrer">ESPN · Consulta externa ↗</a></div>
        <details className="footer-provenance">
          <summary>Proveniência, corte analítico e critérios das fontes</summary>
          <p>Corte analítico dos resultados: {cutoffLabel}. A classificação local é derivada do pacote, não uma classificação CBF oficial; {cbfArchiveProvenance}. A página CBF atual não faz parte do pacote. Artilharia: {SCORERS_SOURCE.name}, captura {scorersCaptureLabel}, {scorersCaptureRelation}; {scorersCoverageNote}.</p>
          <p>Versão {buildInfo.version} · build {buildInfo.sha7} · {buildInfo.time ? formatUtcIso(buildInfo.time) : 'data do commit indisponível'}</p>
        </details>
      </footer>
    </>
  )
}

export default App
