import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures } from './projectionData'
import { getCurrentVenueStats, getHeadToHeadSummary, getHistoricalVenueStats, type VenueStats } from './seasonStats'

const pointsPerMatchFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPointsPerMatch(value: number | null): string {
  return value === null ? '—' : pointsPerMatchFormat.format(value)
}

function formatHeadToHeadStats(club: string, venue: 'em casa' | 'fora', stats: VenueStats): string {
  return `${club} ${venue}: N=${stats.matches} · V-E-D=${stats.wins}-${stats.draws}-${stats.losses} · ${stats.points} ${stats.points === 1 ? 'ponto' : 'pontos'}`
}

interface VenueStatsCardProps {
  title: string
  stats: VenueStats
}

function VenueStatsCard({ title, stats }: VenueStatsCardProps): JSX.Element {
  return (
    <article className="venue-stats-card">
      <h4>{title}</h4>
      <dl>
        <div><dt>Jogos · V-E-D</dt><dd>{stats.matches} · {stats.wins}-{stats.draws}-{stats.losses}</dd></div>
        <div><dt>Pontos por jogo</dt><dd>{formatPointsPerMatch(stats.pointsPerMatch)}</dd></div>
        <div><dt>GP · GC · saldo</dt><dd>{stats.goalsFor} · {stats.goalsAgainst} · {stats.goalDifference > 0 ? '+' : ''}{stats.goalDifference}</dd></div>
      </dl>
    </article>
  )
}

export function FixtureCalendar(): JSX.Element {
  const [selectedClubId, setSelectedClubId] = useState('flamengo')
  const selectedClub = currentClubs.find((club) => club.id === selectedClubId) ?? currentClubs[0]!
  const currentStats = getCurrentVenueStats(selectedClub.id)
  const historicalStats = getHistoricalVenueStats(selectedClub.id)
  const clubNames = useMemo(() => new Map(currentClubs.map(({ id, club }) => [id, club])), [])
  const fixtures = remainingFixtures.filter((fixture) => fixture.home === selectedClub.id || fixture.away === selectedClub.id)

  return (
    <section className="fixture-calendar panel" id="calendario" aria-labelledby="fixture-calendar-title">
      <div className="fixture-calendar-heading">
        <div>
          <p className="eyebrow eyebrow-dark">MANDO E ADVERSÁRIO</p>
          <h2 id="fixture-calendar-title">Calendário restante por clube</h2>
          <p>Os confrontos abaixo são os mesmos 48 usados, um a um, na simulação. A rodada e a referência seguem a tabela básica CBF; datas e horários detalhados não são inferidos.</p>
        </div>
        <label className="fixture-club-select">
          <span>Clube</span>
          <select
            aria-label="Clube para consultar calendário"
            value={selectedClub.id}
            onChange={(event) => setSelectedClubId(event.currentTarget.value)}
          >
            {currentClubs.map((club) => <option key={club.id} value={club.id}>{club.club}</option>)}
          </select>
        </label>
      </div>

      <div className="venue-stats-grid" aria-label={`Desempenho de ${selectedClub.club} por mando`}>
        <VenueStatsCard title="2026 · em casa" stats={currentStats.home} />
        <VenueStatsCard title="2026 · fora" stats={currentStats.away} />
        <VenueStatsCard title="2021–2025 · em casa" stats={historicalStats.home} />
        <VenueStatsCard title="2021–2025 · fora" stats={historicalStats.away} />
      </div>

      <div className="fixture-list-heading">
        <h3>Jogos de {selectedClub.club}</h3>
        <span>{fixtures.length} pendentes · {fixtures.filter(({ home }) => home === selectedClub.id).length} em casa · {fixtures.filter(({ away }) => away === selectedClub.id).length} fora</span>
      </div>
      <ol className="remaining-fixture-list">
        {fixtures.map((fixture) => {
          const home = clubNames.get(fixture.home) ?? fixture.home
          const away = clubNames.get(fixture.away) ?? fixture.away
          const isHome = fixture.home === selectedClub.id
          const opponentId = isHome ? fixture.away : fixture.home
          const opponent = clubNames.get(opponentId) ?? opponentId
          const headToHead = getHeadToHeadSummary(fixture.home, fixture.away)

          return (
            <li className="remaining-fixture" key={fixture.cbfRef}>
              <div className="remaining-fixture-meta">
                <span>Rodada {fixture.round}</span>
                <span>{isHome ? 'Mandante' : 'Visitante'}</span>
              </div>
              <strong>{home} <span aria-label="contra">×</span> {away}</strong>
              <p>Adversário: {opponent} · {isHome ? 'jogo em casa' : 'jogo fora'}</p>
              <small>Referência CBF {fixture.cbfRef}</small>
              <div className="head-to-head-context">
                <p>Retrospecto H2H · informativo; sem peso na projeção. Resultados históricos, não previsão.</p>
                <ul aria-label={`Estatísticas H2H de ${home} contra ${away}`}>
                  <li>2021–2025 · {formatHeadToHeadStats(home, 'em casa', headToHead.historical.home)}</li>
                  <li>2021–2025 · {formatHeadToHeadStats(home, 'fora', headToHead.historical.away)}</li>
                  <li>2026 · {formatHeadToHeadStats(home, 'em casa', headToHead.current.home)}</li>
                  <li>2026 · {formatHeadToHeadStats(home, 'fora', headToHead.current.away)}</li>
                </ul>
                <details>
                  <summary>Placares do retrospecto ({headToHead.matches.length})</summary>
                  {headToHead.matches.length > 0 ? (
                    <ol aria-label={`Placares H2H de ${home} e ${away}`}>
                      {headToHead.matches.map((match, index) => {
                        const meetingHome = clubNames.get(match.home) ?? match.home
                        const meetingAway = clubNames.get(match.away) ?? match.away
                        const homeVenue = match.home === fixture.home ? 'mandante' : 'visitante'
                        return (
                          <li key={`${match.seasonYear}-${match.kickoff}-${index}`}>
                            {match.seasonYear} · {meetingHome} {match.homeGoals}–{match.awayGoals} {meetingAway} · {home} como {homeVenue}
                          </li>
                        )
                      })}
                    </ol>
                  ) : <p>Sem placares disponíveis no recorte.</p>}
                </details>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="fixture-calendar-note">Sem índice de dificuldade: os adversários e o mando ficam explícitos; a força relativa vem das taxas casa/fora regularizadas e dos jogos históricos, não de um rótulo de calendário.</p>
    </section>
  )
}
