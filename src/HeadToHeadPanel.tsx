import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures } from './projectionData'
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

/** Card por período: V-E-D do confronto e gols agregados entre os dois clubes. */
function PeriodCard({ title, outcome, aName, bName }: { title: string; outcome: HeadToHeadOutcome; aName: string; bName: string }): JSX.Element {
  return (
    <div className="h2h-period-card">
      <h4>{title}</h4>
      <strong>{aName} {outcome.winsA} · {outcome.draws} · {outcome.winsB} {bName}</strong>
      <span>
        {outcome.matches === 1 ? '1 encontro' : `${outcome.matches} encontros`}
        {outcome.matches > 0 && ` · gols ${outcome.goalsA}–${outcome.goalsB}`}
      </span>
    </div>
  )
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
  const clubNames = useMemo(() => new Map(currentClubs.map(({ id, club }) => [id, club])), [])
  const clubA = currentClubs.find(({ id }) => id === clubAId) ?? currentClubs[0]!
  const clubB = currentClubs.find(({ id }) => id === clubBId) ?? currentClubs[1]!
  const summary = useMemo(() => getHeadToHeadSummary(clubA.id, clubB.id), [clubA.id, clubB.id])

  const overall = useMemo(() => outcomeOfMatches(summary.matches, clubA.id, clubB.id), [summary, clubA.id, clubB.id])
  const currentOutcome = useMemo(
    () => outcomeOfMatches(summary.matches.filter((match) => match.seasonYear === 2026), clubA.id, clubB.id),
    [summary, clubA.id, clubB.id],
  )
  const historicalOutcome = useMemo(
    () => outcomeOfMatches(summary.matches.filter((match) => match.seasonYear <= 2025), clubA.id, clubB.id),
    [summary, clubA.id, clubB.id],
  )
  const nextMeeting = remainingFixtures.find((fixture) =>
    (fixture.home === clubA.id && fixture.away === clubB.id) || (fixture.home === clubB.id && fixture.away === clubA.id))

  return (
    <section className="panel head-to-head-panel" aria-labelledby="head-to-head-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">CONFRONTO DIRETO</p><h2 id="head-to-head-title">{clubA.club} × {clubB.club}</h2></div>
        <span className="section-index">02 <span>/ RETROSPECTO</span></span>
      </div>
      <p className="table-note">Retrospecto dos encontros disponíveis de 2021–2026 até o corte. Histórico, não previsão; nunca altera as probabilidades.</p>

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
      </div>

      {clubA.id === clubB.id ? (
        <div className="empty-state-card" role="status">
          <p className="empty-state-title">Escolha dois clubes distintos</p>
          <p className="empty-state-description">Selecione clubes diferentes nos dois campos para ver o retrospecto direto entre eles.</p>
        </div>
      ) : (
        <>
          <div className="h2h-summary">
            <HeadToHeadBar outcome={overall} aName={clubA.club} bName={clubB.club} />
            {nextMeeting && (
              <div className="h2h-next-meeting">
                <strong>Próximo confronto no calendário</strong>
                <p>{clubNames.get(nextMeeting.home)} × {clubNames.get(nextMeeting.away)} · Rodada {nextMeeting.round} · ref. CBF {nextMeeting.cbfRef}</p>
              </div>
            )}
          </div>

          <div className="h2h-columns">
            <div className="h2h-timeline">
              <h3>Encontros ({summary.matches.length})</h3>
              {summary.matches.length === 0
                ? <p className="empty-distribution">Sem placares disponíveis no recorte para este par.</p>
                : <ul aria-label={`Timeline de encontros entre ${clubA.club} e ${clubB.club}`}>
                    {summary.matches.map((match, index) => (
                      <MeetingDot key={`${match.seasonYear}-${match.kickoff}-${index}`} match={match} aId={clubA.id} aName={clubA.club} bName={clubB.club} />
                    ))}
                  </ul>}
              <p className="table-note">Badge V/E/D é do ponto de vista de {clubA.club} (clube A).</p>
            </div>
            <div className="h2h-periods">
              <h3>Retrospecto por período</h3>
              <div className="h2h-period-grid">
                <PeriodCard title="Temporada 2026 · até o corte" outcome={currentOutcome} aName={clubA.club} bName={clubB.club} />
                <PeriodCard title="2021–2025 · histórico do confronto" outcome={historicalOutcome} aName={clubA.club} bName={clubB.club} />
              </div>
              <p className="table-note">V-E-D e gols agregados somente dos encontros entre os dois clubes.</p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
