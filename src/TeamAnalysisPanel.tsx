import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures } from './projectionData'
import { getCurrentVenueStats, type VenueStats } from './seasonStats'
import { recentForm, currentStreaks, attackDefenseLeaders } from './rounds'
import { useProjection } from './ProjectionContext'
import { VenueStatsCard } from './FixtureCalendar'
import { ZONES } from './projectionConfig'
import { seasonFacts } from './seasonFacts'

/**
 * Análise de um clube: forma recente, sequência vigente, casa/fora, projeção
 * de destino final (probabilidades e pontos) e jogos restantes — tudo em um
 * só painel para responder "como está e para onde vai esse time".
 */

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR')
const signedDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })

const FORM_LABELS = { W: 'V', D: 'E', L: 'D' } as const

function FormStrip({ clubId, clubName }: { clubId: string; clubName: string }): JSX.Element {
  const form = useMemo(() => recentForm(clubId, 5), [clubId])
  return (
    <div className="team-kpi">
      <strong>{form.filter((entry) => entry.result === 'W').length}V · {form.filter((entry) => entry.result === 'D').length}E · {form.filter((entry) => entry.result === 'L').length}D</strong>
      <span>Últimos 5 jogos de {clubName}</span>
      <div className="form-dots" aria-label={`Forma recente: ${form.map((entry) => FORM_LABELS[entry.result]).join(', ')}`}>
        {form.map((entry) => (
          <span key={entry.kickoff} className={`form-dot form-dot--${entry.result}`} title={`${entry.home} ${entry.homeGoals}–${entry.awayGoals} ${entry.away}`}>
            {FORM_LABELS[entry.result]}
          </span>
        ))}
      </div>
    </div>
  )
}

function StreakCard({ clubId, clubName }: { clubId: string; clubName: string }): JSX.Element | null {
  const streak = useMemo(() => currentStreaks().find((entry) => entry.id === clubId), [clubId])
  if (!streak) return null
  const lines: string[] = []
  if (streak.wins > 0) lines.push(`${streak.wins} vitórias seguidas`)
  if (streak.draws > 0) lines.push(`${streak.draws} empates seguidos`)
  if (streak.losses > 0) lines.push(`${streak.losses} derrotas seguidas`)
  if (streak.unbeaten > 1) lines.push(`${streak.unbeaten} jogos invicto`)
  if (streak.winless > 1) lines.push(`${streak.winless} jogos sem vitória`)
  return (
    <div className="team-kpi">
      <strong>{lines[0] ?? 'Sem sequência ativa'}</strong>
      <span>Sequência vigente de {clubName}{lines.length > 1 ? ` · ${lines.slice(1).join(' · ')}` : ''}</span>
    </div>
  )
}

function VenuePair({ clubId }: { clubId: string }): JSX.Element {
  const stats = useMemo(() => getCurrentVenueStats(clubId), [clubId])
  const card = (title: string, venueStats: VenueStats): JSX.Element => (
    <VenueStatsCard title={title} stats={venueStats} />
  )
  return (
    <div className="team-kpi team-kpi--wide">
      <strong>{decimal.format((stats.home.pointsPerMatch ?? 0) + (stats.away.pointsPerMatch ?? 0))} pts/jogo</strong>
      <span>Casa e fora na temporada até o corte</span>
      <div className="venue-stats-grid h2h-stats-grid">
        {card('Casa · V-E-D · pts/j', stats.home)}
        {card('Fora · V-E-D · pts/j', stats.away)}
      </div>
    </div>
  )
}

function FinalProjection({ clubId, clubName }: { clubId: string; clubName: string }): JSX.Element | null {
  const { result, status } = useProjection()
  const club = result?.clubProbabilities.find((entry) => entry.id === clubId)
  if (!result || !club || status !== 'ready') {
    return (
      <div className="team-kpi team-kpi--wide">
        <strong>{status === 'error' ? 'Projeção indisponível' : 'Projeção em cálculo…'}</strong>
        <span>{status === 'error' ? 'A distribuição de destinos não é substituída por estimativa manual.' : 'A distribuição de destinos aparece quando as simulações concluírem.'}</span>
      </div>
    )
  }
  const delta = club.pointsStats.median - club.currentPoints
  const zoneChips = [
    { label: 'Título', value: club.title },
    { label: 'Libertadores', value: club.libertadores },
    { label: 'Sul-Americana', value: club.sudamericana },
    { label: 'Rebaixamento', value: club.relegation },
  ]
  return (
    <div className="team-kpi team-kpi--wide">
      <strong>{club.pointsStats.median} pts <small className="cell-ci">mediana · {signedDecimal.format(delta)} vs hoje</small></strong>
      <span>Destinos de {clubName} nas {integer.format(result.simulations)} simulações (faixa típica {club.pointsStats.p25}–{club.pointsStats.p75} · P90 {club.pointsStats.p90})</span>
      <div className="projection-zone-strip">
        {zoneChips.map((chip) => (
          <div className="projection-zone-chip" key={chip.label}>
            <strong>{percent.format(chip.value)}</strong>
            <span>{chip.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FutureFixtures({ clubId, clubName }: { clubId: string; clubName: string }): JSX.Element {
  const fixtures = useMemo(() => remainingFixtures.filter((fixture) => fixture.home === clubId || fixture.away === clubId), [clubId])
  const names = useMemo(() => new Map(currentClubs.map(({ id, club }) => [id, club])), [])
  return (
    <div className="team-kpi team-kpi--wide">
      <strong>{fixtures.length} jogos restantes</strong>
      <span>Calendário de {clubName} ({ZONES.libertadores.from}º–{ZONES.relegation.to}º decidem as vagas)</span>
      <ul className="team-future">
        {fixtures.map((fixture) => {
          const isHome = fixture.home === clubId
          const opponent = names.get(isHome ? fixture.away : fixture.home) ?? (isHome ? fixture.away : fixture.home)
          return (
            <li className="team-future-item" key={fixture.cbfRef}>
              <strong>{isHome ? 'Casa' : 'Fora'} × {opponent}</strong>
              <span>Rodada {fixture.round} · ref. CBF {fixture.cbfRef}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function TeamAnalysisPanel(): JSX.Element {
  const [clubId, setClubId] = useState('gremio')
  const club = currentClubs.find((entry) => entry.id === clubId) ?? currentClubs[0]!
  const extremes = useMemo(() => attackDefenseLeaders(), [])

  return (
    <section className="panel team-analysis" aria-labelledby="team-analysis-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">ANÁLISE POR CLUBE</p><h2 id="team-analysis-title">Como está e para onde vai</h2></div>
        <span className="section-index">03 <span>/ CLUBE</span></span>
      </div>
      <p className="table-note">
        Forma recente, sequência, mando, destinos projetados e jogos restantes em um só lugar. Última rodada com jogos disputados no corte: {seasonFacts.lastPlayedRound}ª ·
        melhores da temporada: {extremes.attack.club} no ataque ({decimal.format(extremes.attack.goalsPerMatch)} gols/jogo), {extremes.defense.club} na defesa.
      </p>
      <label className="fixture-club-select next-round-select">
        <span>Clube analisado</span>
        <select aria-label="Clube para análise individual" value={club.id} onChange={(event) => setClubId(event.currentTarget.value)}>
          {currentClubs.map((entry) => <option key={entry.id} value={entry.id}>{entry.club}</option>)}
        </select>
      </label>

      <div className="team-analysis-grid">
        <div className="team-kpi">
          <strong>{club.position}º · {club.points} pts</strong>
          <span>Posição e pontos no corte · {club.played} jogos · saldo {club.goalsFor - club.goalsAgainst > 0 ? '+' : ''}{club.goalsFor - club.goalsAgainst}</span>
        </div>
        <FormStrip clubId={club.id} clubName={club.club} />
        <StreakCard clubId={club.id} clubName={club.club} />
        <VenuePair clubId={club.id} />
        <FinalProjection clubId={club.id} clubName={club.club} />
        <FutureFixtures clubId={club.id} clubName={club.club} />
      </div>
      <p className="table-note">Projeções condicionais ao corte e às vagas geradas pela tabela; o retrospecto e a forma são histórico, não previsão.</p>
    </section>
  )
}
