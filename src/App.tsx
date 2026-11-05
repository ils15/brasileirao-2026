import { useEffect, useMemo, useState, type JSX } from 'react'
import { getZoneLabel, matchesClubFilter, scorers, standings, type ClubFilter, type Standing } from './data'
import { ProjectionSection } from './ProjectionSection'
import { FixtureCalendar } from './FixtureCalendar'

const CBF_URL = 'https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026'
const ESPN_URL = 'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols'
const cutoffSummary = 'Corte analítico: 04/11/2026 · 13:00 BRT · arquivos capturados ~16:41 BRT; HTML CBF exibe 04/11/2026 - 19:41, fuso/semântica desconhecidos'
type ThemeMode = 'system' | 'light' | 'dark'

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
  { id: 'qualification', label: 'Classificação' },
  { id: 'middle', label: 'Demais posições' },
  { id: 'relegation', label: 'Rebaixamento' },
]

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function zoneClass(position: number): string {
  if (position <= 6) return 'qualification'
  if (position >= 17) return 'relegation'
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
  return <span className="team-badge" aria-hidden="true">{team.initials}</span>
}

function App(): JSX.Element {
  const [query, setQuery] = useState('')
  const [clubFilter, setClubFilter] = useState<ClubFilter>('all')
  const [theme, setTheme] = useState<ThemeMode>(getSavedTheme)
  const leader = standings[0]!
  const normalizedQuery = normalizeText(query.trim())

  const filteredStandings = useMemo(
    () => standings.filter((team) => normalizeText(team.club).includes(normalizedQuery)),
    [normalizedQuery],
  )
  const filteredClubs = useMemo(
    () => standings.filter((team) => matchesClubFilter(team.position, clubFilter)),
    [clubFilter],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem('br2026-theme', theme)
    } catch {
      // A restricted browser can still use the selected theme for this visit.
    }
  }, [theme])

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
        <section className="hero" id="inicio" aria-labelledby="hero-title">
          <div className="hero-pattern" aria-hidden="true" />
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-line" />CAMPEONATO BRASILEIRO · SÉRIE A</p>
              <h1 id="hero-title">A paixão do<br /><em>futebol brasileiro.</em></h1>
              <p className="hero-description">Acompanhe a tabela, os clubes e os goleadores da temporada 2026.</p>
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
                <div><strong>{leader.points}</strong><span>PONTOS</span></div>
                <div><strong>{leader.played}</strong><span>JOGOS</span></div>
                <span className="leader-stat-caption">Classificação oficial<br />CBF</span>
              </div>
              <span className="leader-watermark" aria-hidden="true">26</span>
            </aside>
          </div>
          <div className="hero-foot"><span>20 CLUBES · UM CAMPEÃO</span><span>BRASIL <span aria-hidden="true">✳</span> 2026</span></div>
        </section>

        <section className="source-strip" aria-label="Fonte e horário dos dados">
          <div className="snapshot-summary">
            <span className="snapshot-badge">Snapshot estático</span>
            <div className="snapshot-copy">
              <p className="snapshot-state">Sem atualização ao vivo.</p>
              <p>{cutoffSummary}</p>
            </div>
          </div>
          <span className="source-separator" aria-hidden="true" />
          <a href={CBF_URL} target="_blank" rel="noreferrer">Fonte oficial: CBF <span aria-hidden="true">↗</span></a>
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
        </section>

        <nav className="section-nav" aria-label="Navegação por área">
          <a href="#probabilidades-time">Por time</a>
          <a href="#por-pontuacao">Por pontuação</a>
          <a href="#classificacao">Classificação</a>
          <a href="#calendario">Calendário</a>
          <a href="#estatisticas">Estatísticas/Metodologia</a>
        </nav>

        <div className="content-wrap">
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
                <p className="result-count" aria-live="polite">
                  {filteredStandings.length} {filteredStandings.length === 1 ? 'clube encontrado' : 'clubes encontrados'}
                </p>
              </div>
              <div className="zone-legend" aria-label="Legenda das zonas da tabela">
                <span><i className="legend-dot qualification" />Faixa de classificação · 1–6</span>
                <span><i className="legend-dot middle" />Demais posições · 7–16</span>
                <span><i className="legend-dot relegation" />Rebaixamento · 17–20</span>
              </div>
              <div className="table-scroll" role="region" aria-label="Tabela classificatória; role para rolagem horizontal em telas pequenas" tabIndex={0}>
                <table>
                  <thead><tr><th scope="col">POS</th><th scope="col">CLUBE</th><th scope="col" className="numeric">PTS</th><th scope="col" className="numeric">J</th></tr></thead>
                  <tbody>
                    {filteredStandings.map((team) => (
                      <tr className={`standing-row standing-row--${zoneClass(team.position)}`} key={team.club} aria-label={`${team.club}: ${getZoneLabel(team.position)}`}>
                        <td className="position-cell"><span>{String(team.position).padStart(2, '0')}</span></td>
                        <th scope="row" className="club-cell"><TeamBadge team={team} /><span>{team.club}</span></th>
                        <td className="points-cell numeric">{team.points}</td>
                        <td className="games-cell numeric">{team.played}</td>
                      </tr>
                    ))}
                    {filteredStandings.length === 0 && (
                      <tr><td className="empty-state" colSpan={4}>Nenhum clube encontrado. Tente outro nome.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="table-note">Posições oficiais mantidas conforme a CBF. O número de jogos varia entre os clubes.</p>
            </div>

            <section className="scorers-panel panel" id="artilharia" aria-labelledby="scorers-title">
              <div className="section-heading">
                <div><p className="eyebrow eyebrow-dark">QUEM FAZ A DIFERENÇA</p><h2 id="scorers-title">Artilharia</h2></div>
                <span className="section-index">02 <span>/ GOLS</span></span>
              </div>
              <p className="scorers-caption">Os goleadores da temporada</p>
              <ol className="scorer-list" aria-label="Artilharia">
                {scorers.map((scorer, index) => (
                  <li className="scorer-item" key={`${scorer.name}-${scorer.club}`}>
                    <span className="scorer-rank">{scorer.position}</span>
                    <span className={`scorer-avatar scorer-avatar--${index + 1}`} aria-hidden="true">{scorer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                    <span className="scorer-info"><strong>{scorer.name}</strong><small>{scorer.club}</small></span>
                    <span className="goal-count"><strong>{scorer.goals}</strong><small>GOLS</small></span>
                  </li>
                ))}
              </ol>
              <p className="scorers-source-note">Fonte secundária: ESPN. Horário de captura específico da lista não informado neste painel.</p>
              <div className="tie-note"><span aria-hidden="true">↗</span> Posições empatadas exibidas sem exclusões.</div>
              <a className="text-link" href={ESPN_URL} target="_blank" rel="noreferrer">Ver estatísticas na ESPN <span aria-hidden="true">↗</span></a>
            </section>
          </section>

          <ProjectionSection />

          <FixtureCalendar />

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
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><BrandMark /><strong>BRASILEIRÃO <span>2026</span></strong></div>
        <p>Snapshot estático · Simulações em segundo plano · Sem dados ao vivo.</p>
        <div className="footer-sources"><a href={CBF_URL} target="_blank" rel="noreferrer">CBF · Classificação oficial ↗</a><a href={ESPN_URL} target="_blank" rel="noreferrer">ESPN · Conferência de artilharia ↗</a></div>
        <small>A classificação foi reconciliada em agregado ao conjunto de jogos até 04/11/2026 13:00 BRT; a cópia CBF foi capturada depois e não valida placares individuais. Artilharia de fonte secundária · sem atualização em tempo real.</small>
      </footer>
    </>
  )
}

export default App
