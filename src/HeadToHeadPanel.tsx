import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures, espnLogoUrl } from './projectionData'
import { HomeIcon, AwayIcon } from './icons'
import { getHeadToHeadSummary } from './seasonStats'

/**
 * Confronto direto visual entre dois clubes selecionáveis: barra proporcional
 * de resultados, timeline dos encontros, retrospecto por mando e o próximo
 * jogo entre eles no calendário. Retrospecto é histórico — não previsão.
 */

interface HeadToHeadOutcome {
  winsA: number
  draws: number
  winsB: number
  goalsA: number
  goalsB: number
  matches: number
}

function outcomeOfMatches(matches: readonly { home: string; away: string; homeGoals: number; awayGoals: number }[], aId: string, bId: string): HeadToHeadOutcome {
  let winsA = 0
  let draws = 0
  let winsB = 0
  let goalsA = 0
  let goalsB = 0
  for (const match of matches) {
    const scoredA = match.home === aId ? match.homeGoals : match.awayGoals
    const scoredB = match.home === bId ? match.homeGoals : match.awayGoals
    if (scoredA > scoredB) winsA += 1
    else if (scoredA === scoredB) draws += 1
    else winsB += 1
    goalsA += scoredA
    goalsB += scoredB
  }
  return { winsA, draws, winsB, goalsA, goalsB, matches: matches.length }
}

const outcomeLabels = (a: string, b: string) => [`Vitórias de ${a}`, 'Empates', `Vitórias de ${b}`] as const

const YEAR_OPTIONS = Array.from({ length: 15 }, (_, index) => 2012 + index)

function HeadToHeadBar({ outcome, aName, bName }: { outcome: HeadToHeadOutcome; aName: string; bName: string }): JSX.Element {
  const total = Math.max(1, outcome.winsA + outcome.draws + outcome.winsB)
  const labels = outcomeLabels(aName, bName)
  return (
    <div className="result-bar-block">
      <div className="result-bar" role="img" aria-label={`Retrospecto direto: ${labels[0]} ${outcome.winsA}, ${labels[1]} ${outcome.draws}, ${labels[2]} ${outcome.winsB}`}>
        <span className="result-bar-segment result-bar-segment--home" style={{ width: `${(outcome.winsA / total) * 100}%` }} />
        <span className="result-bar-segment result-bar-segment--draw" style={{ width: `${(outcome.draws / total) * 100}%` }} />
        <span className="result-bar-segment result-bar-segment--away" style={{ width: `${(outcome.winsB / total) * 100}%` }} />
      </div>
      <div className="result-bar-legend">
        <span>{aName} <strong>{outcome.winsA}</strong></span>
        <span>Empates <strong>{outcome.draws}</strong></span>
        <span><strong>{outcome.winsB}</strong> {bName}</span>
      </div>
    </div>
  )
}

/** Card de mando dentro do confronto: como o clube A se saiu em casa / fora NESTE confronto. */
function VenuePeriodCard({ venue, title, outcome, aName, bName }: { venue: 'home' | 'away'; title: string; outcome: HeadToHeadOutcome; aName: string; bName: string }): JSX.Element {
  const Icon = venue === 'home' ? HomeIcon : AwayIcon
  return (
    <div className="h2h-period-card">
      <h4><Icon /> {title}</h4>
      <strong>{aName} {outcome.winsA} · {outcome.draws} · {outcome.winsB} {bName}</strong>
      <span>
        {outcome.matches === 0
          ? 'sem encontros nesse mando no período'
          : `${outcome.matches === 1 ? '1 encontro' : `${outcome.matches} encontros`} · gols ${outcome.goalsA}–${outcome.goalsB}`}
      </span>
    </div>
  )
}

/** Escudo real com fallback silencioso para nada. */
function Crest({ clubId, size = 'medium' }: { clubId: string; size?: 'medium' | 'large' }): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  const logo = espnLogoUrl(clubId)
  if (!logo || failed) return null
  return <img className={`crest crest--${size}`} src={logo} alt="" aria-hidden="true" loading="lazy" onError={() => setFailed(true)} />
}

function MeetingDot({ match, aId, aName, bName }: { match: { home: string; away: string; homeGoals: number; awayGoals: number; seasonYear: number; kickoff: string }; aId: string; aName: string; bName: string }): JSX.Element {
  const goalsA = match.home === aId ? match.homeGoals : match.awayGoals
  const goalsB = match.home === aId ? match.awayGoals : match.homeGoals
  const kind = goalsA > goalsB ? 'win' : goalsA === goalsB ? 'draw' : 'loss'
  const badge = kind === 'win' ? 'V' : kind === 'draw' ? 'E' : 'D'
  return (
    <li className={`meeting-item meeting-item--${kind}`}>
      <span className={`meeting-badge meeting-badge--${kind}`} aria-hidden="true">{badge}</span>
      <span className="meeting-year">{match.seasonYear}</span>
      <strong>{match.home} <span className="meeting-score">{match.homeGoals}–{match.awayGoals}</span> {match.away}</strong>
      <span className="sr-only">{kind === 'win' ? `vitória de ${aName}` : kind === 'draw' ? 'empate' : `vitória de ${bName}`}</span>
    </li>
  )
}

export function HeadToHeadPanel(): JSX.Element {
  const [clubAId, setClubAId] = useState('flamengo')
  const [clubBId, setClubBId] = useState('palmeiras')
  const [periodFrom, setPeriodFrom] = useState(2012)
  const [periodTo, setPeriodTo] = useState(2026)
  const clubNames = useMemo(() => new Map(currentClubs.map(({ id, club }) => [id, club])), [])
  const clubA = currentClubs.find(({ id }) => id === clubAId) ?? currentClubs[0]!
  const clubB = currentClubs.find(({ id }) => id === clubBId) ?? currentClubs[1]!
  const summary = useMemo(() => getHeadToHeadSummary(clubA.id, clubB.id), [clubA.id, clubB.id])

  const filteredMatches = useMemo(
    () => summary.matches.filter((match) => match.seasonYear >= periodFrom && match.seasonYear <= periodTo),
    [summary, periodFrom, periodTo],
  )
  const filteredOutcome = useMemo(() => outcomeOfMatches(filteredMatches, clubA.id, clubB.id), [filteredMatches, clubA.id, clubB.id])
  const overall = filteredOutcome
  const homeOutcome = useMemo(
    () => outcomeOfMatches(filteredMatches.filter((match) => match.home === clubA.id), clubA.id, clubB.id),
    [filteredMatches, clubA.id, clubB.id],
  )
  const awayOutcome = useMemo(
    () => outcomeOfMatches(filteredMatches.filter((match) => match.away === clubA.id), clubA.id, clubB.id),
    [filteredMatches, clubA.id, clubB.id],
  )
  // Lacunas de divisão: clubes que caíram/subiram não se enfrentaram em todos os anos do período.
  const yearsWithMeetings = useMemo(
    () => [...new Set(filteredMatches.map((match) => match.seasonYear))].sort((left, right) => left - right),
    [filteredMatches],
  )
  const gapYears = useMemo(() => {
    const all = Array.from({ length: periodTo - periodFrom + 1 }, (_, index) => periodFrom + index)
    return all.filter((year) => !yearsWithMeetings.includes(year))
  }, [yearsWithMeetings, periodFrom, periodTo])
  const gapsSummary = gapYears.length === 0
    ? 'nenhuma lacuna: encontros em todos os anos do período'
    : gapYears.length <= 6
      ? `sem encontros em ${gapYears.join(', ')} (clubes em divisões diferentes)`
      : `sem encontros em ${gapYears.length} anos do período (clubes em divisões diferentes)`
  const nextMeeting = remainingFixtures.find((fixture) =>
    (fixture.home === clubA.id && fixture.away === clubB.id) || (fixture.home === clubB.id && fixture.away === clubA.id))

  return (
    <section className="panel head-to-head-panel" aria-labelledby="head-to-head-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">Confronto direto</p><h2 id="head-to-head-title" className="h2h-title"><Crest clubId={clubA.id} size="large" /> {clubA.club} × {clubB.club} <Crest clubId={clubB.id} size="large" /></h2></div>
        <span className="section-index">02 <span>/ RETROSPECTO</span></span>
      </div>
      <p className="table-note">Retrospecto dos encontros disponíveis de 2012–2026 até o corte. Histórico, não previsão; nunca altera as probabilidades.</p>

      <div className="h2h-selects">
        <label className="fixture-club-select">
          <span>Clube A</span>
          <select aria-label="Clube A do confronto" value={clubA.id} onChange={(event) => setClubAId(event.currentTarget.value)}>
            {currentClubs.map((club) => <option key={club.id} value={club.id}>{club.club}</option>)}
          </select>
        </label>
        <label className="fixture-club-select">
          <span>Clube B</span>
          <select aria-label="Clube B do confronto" value={clubB.id} onChange={(event) => setClubBId(event.currentTarget.value)}>
            {currentClubs.map((club) => <option key={club.id} value={club.id}>{club.club}</option>)}
          </select>
        </label>
        <label className="fixture-club-select">
          <span>De</span>
          <select aria-label="Ano inicial do período" value={periodFrom}
            onChange={(event) => setPeriodFrom(Math.min(Number(event.currentTarget.value), periodTo))}>
            {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="fixture-club-select">
          <span>Até</span>
          <select aria-label="Ano final do período" value={periodTo}
            onChange={(event) => setPeriodTo(Math.max(Number(event.currentTarget.value), periodFrom))}>
            {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>

      {clubA.id === clubB.id ? (
        <div className="empty-state-card" role="status">
          <p className="empty-state-title">Escolha dois clubes distintos</p>
          <p className="empty-state-description">Selecione clubes diferentes nos dois campos para ver o retrospecto direto entre eles.</p>
        </div>
      ) : (
        <>
          <div className="h2h-summary h2h-summary-grid">
            <div className="h2h-summary-main">
            <div className="h2h-period-presets" role="group" aria-label="Períodos rápidos do retrospecto">
              <button
                type="button"
                className={periodFrom === 2012 && periodTo === 2026 ? 'evolution-chip is-selected' : 'evolution-chip'}
                aria-pressed={periodFrom === 2012 && periodTo === 2026}
                onClick={() => { setPeriodFrom(2012); setPeriodTo(2026) }}
              >Desde 2012</button>
              <button
                type="button"
                className={periodFrom === 2021 && periodTo === 2025 ? 'evolution-chip is-selected' : 'evolution-chip'}
                aria-pressed={periodFrom === 2021 && periodTo === 2025}
                onClick={() => { setPeriodFrom(2021); setPeriodTo(2025) }}
              >2021–2025</button>
              <button
                type="button"
                className={periodFrom === 2026 && periodTo === 2026 ? 'evolution-chip is-selected' : 'evolution-chip'}
                aria-pressed={periodFrom === 2026 && periodTo === 2026}
                onClick={() => { setPeriodFrom(2026); setPeriodTo(2026) }}
              >Temporada 2026</button>
            </div>
            <HeadToHeadBar outcome={overall} aName={clubA.club} bName={clubB.club} />
            <p className="table-note">
              Período {periodFrom}–{periodTo}: {overall.matches === 1 ? '1 encontro' : `${overall.matches} encontros`} · gols {overall.goalsA}–{overall.goalsB} ({clubA.club} primeiro)
                {gapYears.length > 0 && <> · {gapsSummary}</>}
            </p>
            </div>
            <div className="h2h-summary-side">
              {nextMeeting && (
                <div className="h2h-next-meeting">
                  <strong>Próximo confronto no calendário</strong>
                  <p>{clubNames.get(nextMeeting.home)} × {clubNames.get(nextMeeting.away)} · Rodada {nextMeeting.round} · ref. CBF {nextMeeting.cbfRef}</p>
                </div>
              )}
              <div className="h2h-period-grid">
                <VenuePeriodCard venue="home" title={`${clubA.club} como mandante`} outcome={homeOutcome} aName={clubA.club} bName={clubB.club} />
                <VenuePeriodCard venue="away" title={`${clubA.club} como visitante`} outcome={awayOutcome} aName={clubA.club} bName={clubB.club} />
              </div>
              <p className="table-note">Mando dentro do confronto: só encontros entre os dois, no período filtrado.</p>
            </div>
          </div>

          <div className="h2h-columns">
            <div className="h2h-timeline">
              <h3>Encontros no período ({filteredMatches.length})</h3>
              {summary.matches.length === 0
                ? <p className="empty-distribution">Sem placares disponíveis no recorte para este par.</p>
                : <ul aria-label={`Timeline de encontros entre ${clubA.club} e ${clubB.club} no período de ${periodFrom} a ${periodTo}`}>
                    {summary.matches.map((match, index) => (
                      <MeetingDot key={`${match.seasonYear}-${match.kickoff}-${index}`} match={match} aId={clubA.id} aName={clubA.club} bName={clubB.club} />
                    ))}
                  </ul>}
              <p className="table-note">Badge V/E/D é do ponto de vista de {clubA.club} (clube A).</p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
