import { useMemo, useState, type JSX } from 'react'
import { HomeIcon, AwayIcon, BallIcon } from './icons'
import { ScoreLine } from './ScoreLine'
import { currentClubs, remainingFixtures } from './projectionData'
import { getCurrentVenueStats, getHeadToHeadSummary, getHistoricalVenueStats, type VenueStats } from './seasonStats'
import { matchProbabilities } from './matchProbabilities'

const pointsPerMatchFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPointsPerMatch(value: number | null): string {
  return value === null ? '—' : pointsPerMatchFormat.format(value)
}

interface VenueStatsCardProps {
  title: string
  stats: VenueStats
  /** Ícone do mando: casa, fora ou geral (bola). */
  venue?: 'home' | 'away' | 'ball'
}

/** Card de estatísticas por mando; reutilizado no painel de confrontos. */
export function VenueStatsCard({ title, stats, venue = 'ball' }: VenueStatsCardProps): JSX.Element {
  const Icon = venue === 'home' ? HomeIcon : venue === 'away' ? AwayIcon : BallIcon
  return (
    <article className="venue-stats-card">
      <h4 className="venue-stats-title"><Icon /> {title}</h4>
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
        <VenueStatsCard title="2026 · em casa" venue="home" stats={currentStats.home} />
        <VenueStatsCard title="2026 · fora" venue="away" stats={currentStats.away} />
        {/* O painel expõe o histórico completo disponível, não um recorte recente:
            getHistoricalVenueStats agrega todas as temporadas de historicalSeasons
            (OpenFootball 2003–2011 + Football-Data 2012–2025, 9.176 partidas), e o
            README descreve o retrospecto do calendário como 2003–2025. Os rótulos
            precisam acompanhar o agregado; rotular de "2021–2025" subnotificava o período. */}
        <VenueStatsCard title="2003–2025 · em casa" venue="home" stats={historicalStats.home} />
        <VenueStatsCard title="2003–2025 · fora" venue="away" stats={historicalStats.away} />
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
              {(() => {
                const { probabilities } = matchProbabilities(fixture.home, fixture.away)
                const clubWin = isHome ? probabilities[0] : probabilities[2]
                const clubDraw = probabilities[1]
                const clubLoss = isHome ? probabilities[2] : probabilities[0]
                const expectedPoints = 3 * clubWin + clubDraw
                const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
                return (
                  <div className="fixture-probs" aria-label={`Probabilidades para ${clubNames.get(fixture.home) ?? fixture.home} × ${clubNames.get(fixture.away) ?? fixture.away}: vitória de ${clubNames.get(fixture.home) ?? fixture.home} ${pct.format(probabilities[0])}, empate ${pct.format(probabilities[1])}, vitória de ${clubNames.get(fixture.away) ?? fixture.away} ${pct.format(probabilities[2])}`}>
                    <span className="fixture-prob fixture-prob--win">V {pct.format(clubWin)}</span>
                    <span className="fixture-prob fixture-prob--draw">E {pct.format(clubDraw)}</span>
                    <span className="fixture-prob fixture-prob--loss">D {pct.format(clubLoss)}</span>
                    <span className="fixture-prob-pts">+{expectedPoints.toFixed(2)} pts esperados</span>
                  </div>
                )
              })()}
              <div className="head-to-head-context">
                <p>Retrospecto H2H · informativo; sem peso na projeção. Resultados históricos, não previsão.</p>
                <div className="h2h-mini-grid" aria-label={`Estatísticas H2H de ${home} contra ${away}`}>
                  <span className="h2h-mini"><HomeIcon /> 2003–25 casa · N{headToHead.historical.home.matches} · {headToHead.historical.home.wins}-{headToHead.historical.home.draws}-{headToHead.historical.home.losses} · {headToHead.historical.home.points} pts</span>
                  <span className="h2h-mini"><AwayIcon /> 2003–25 fora · N{headToHead.historical.away.matches} · {headToHead.historical.away.wins}-{headToHead.historical.away.draws}-{headToHead.historical.away.losses} · {headToHead.historical.away.points} pts</span>
                  <span className="h2h-mini"><HomeIcon /> 2026 casa · N{headToHead.current.home.matches} · {headToHead.current.home.wins}-{headToHead.current.home.draws}-{headToHead.current.home.losses} · {headToHead.current.home.points} pts</span>
                  <span className="h2h-mini"><AwayIcon /> 2026 fora · N{headToHead.current.away.matches} · {headToHead.current.away.wins}-{headToHead.current.away.draws}-{headToHead.current.away.losses} · {headToHead.current.away.points} pts</span>
                </div>
                <details>
                  <summary>Placares do retrospecto ({headToHead.matches.length})</summary>
                  {headToHead.matches.length > 0 ? (
                    <ul className="retro-list" aria-label={`Placares H2H de ${home} e ${away}`}>
                      {headToHead.matches.map((match, index) => {
                        const goalsClub = match.home === fixture.home ? match.homeGoals : match.awayGoals
                        const goalsOther = match.home === fixture.home ? match.awayGoals : match.homeGoals
                        const kind = goalsClub > goalsOther ? 'win' : goalsClub === goalsOther ? 'draw' : 'loss'
                        const badge = kind === 'win' ? 'V' : kind === 'draw' ? 'E' : 'D'
                        const meetingHome = clubNames.get(match.home) ?? match.home
                        const meetingAway = clubNames.get(match.away) ?? match.away
                        return (
                          <li key={`${match.seasonYear}-${match.kickoff}-${index}`} className={`meeting-item meeting-item--${kind}`}>
                            <span className={`meeting-badge meeting-badge--${kind}`} aria-hidden="true">{badge}</span>
                            <span className="meeting-year">{match.seasonYear}</span>
                            <strong>{meetingHome} <span className="meeting-score"><ScoreLine homeGoals={match.homeGoals} awayGoals={match.awayGoals} perspectiveHome={match.home === fixture.home} /></span> {meetingAway}</strong>
                          </li>
                        )
                      })}
                    </ul>
                  ) : <p>Sem placares disponíveis no recorte.</p>}
                </details>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="fixture-calendar-note">Sem índice de dificuldade: adversários, mando e forças casa/fora são explícitos. Probabilidades de V/E/D são do modelo, não odds. O desempate simulado (não é classificação oficial) usa pontos → vitórias → saldo → gols pró; confronto direto entre dois clubes; disciplina estimada em grupos de três ou mais e sorteio residual. O snapshot 365scores de 07/11/2026 15:25:20 UTC é pós-corte e não tem timestamp por partida; não comprova cartões no corte nem aplicação integral do Art. 15.</p>
    </section>
  )
}
