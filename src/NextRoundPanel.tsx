import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures } from './projectionData'
import { Crest } from './Crest'
import { matchProbabilities } from './matchProbabilities'
import { seasonFacts } from './seasonFacts'

/**
 * Painel da próxima rodada: jogos pendentes da rodada selecionada com os λ
 * e as probabilidades de resultado do modelo. Probabilidade de resultado
 * (vitória/empate/derrota), não previsão de placar.
 */

interface RoundGroup {
  round: string
  roundNumber: number
  suffix: string
  fixtures: typeof remainingFixtures
}

/** Rodadas pendentes ordenadas; adiados mantêm o número nominal da rodada. */
function pendingRounds(): RoundGroup[] {
  const groups = new Map<string, typeof remainingFixtures>()
  for (const fixture of remainingFixtures) {
    const list = groups.get(fixture.round) ?? []
    list.push(fixture)
    groups.set(fixture.round, list)
  }
  return [...groups.entries()]
    .map(([round, fixtures]) => {
      const [numberPart, ...suffixParts] = round.split(' ')
      return { round, roundNumber: Number.parseInt(numberPart!, 10), suffix: suffixParts.join(' '), fixtures }
    })
    .sort((left, right) => left.roundNumber - right.roundNumber || left.suffix.localeCompare(right.suffix))
}

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function ResultBar({ probabilities, home, away }: { probabilities: readonly [number, number, number]; home: string; away: string }): JSX.Element {
  const [homeWin, draw, awayWin] = probabilities
  return (
    <div className="result-bar-block">
      <div className="result-bar" role="img" aria-label={`Probabilidades: ${home} ${percent.format(homeWin)}, empate ${percent.format(draw)}, ${away} ${percent.format(awayWin)}`}>
        <span className="result-bar-segment result-bar-segment--home" style={{ width: `${homeWin * 100}%` }} />
        <span className="result-bar-segment result-bar-segment--draw" style={{ width: `${draw * 100}%` }} />
        <span className="result-bar-segment result-bar-segment--away" style={{ width: `${awayWin * 100}%` }} />
      </div>
      <div className="result-bar-legend">
        <span>{home} <strong>{percent.format(homeWin)}</strong></span>
        <span>Empate <strong>{percent.format(draw)}</strong></span>
        <span><strong>{percent.format(awayWin)}</strong> {away}</span>
      </div>
    </div>
  )
}

export function NextRoundPanel(): JSX.Element {
  const rounds = useMemo(pendingRounds, [])
  const [selectedRound, setSelectedRound] = useState(rounds[0]?.round ?? '')
  const group = rounds.find((entry) => entry.round === selectedRound) ?? rounds[0]
  const clubNames = useMemo(() => new Map(currentClubs.map(({ id, club }) => [id, club])), [])
  const latestPlayedRound = seasonFacts.lastPlayedRound

  return (
    <section className="panel next-round-panel" aria-labelledby="next-round-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">PRÓXIMOS JOGOS</p><h2 id="next-round-title">Próxima rodada</h2></div>
        <span className="section-index">01 <span>/ CONFRONTOS</span></span>
      </div>
      <p className="table-note">
        Jogos pendentes com os gols esperados (λ) e probabilidades de resultado do modelo — não são previsões de placar nem odds.
        A última rodada com jogos disputados até o corte foi a {latestPlayedRound}ª.
      </p>

      {group && (
        <label className="fixture-club-select next-round-select">
          <span>Rodada pendente</span>
          <select
            aria-label="Selecionar rodada pendente"
            value={group.round}
            onChange={(event) => setSelectedRound(event.currentTarget.value)}
          >
            {rounds.map((entry) => (
              <option key={entry.round} value={entry.round}>
                Rodada {entry.roundNumber}{entry.suffix ? ` (${entry.suffix})` : ''} · {entry.fixtures.length} jogos
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="next-round-grid">
        {group?.fixtures.map((fixture) => {
          const home = clubNames.get(fixture.home) ?? fixture.home
          const away = clubNames.get(fixture.away) ?? fixture.away
          const { expected, probabilities } = matchProbabilities(fixture.home, fixture.away)
          return (
            <article className="next-round-match" key={fixture.cbfRef}>
              <div className="remaining-fixture-meta">
                <span>{home} × {away}</span>
                <span>CBF {fixture.cbfRef}</span>
              </div>
              <strong className="next-round-teams"><Crest clubId={fixture.home} /> {home} <span aria-hidden="true">×</span> {away} <Crest clubId={fixture.away} /></strong>
              <dl className="lambda-strip" aria-label={`Gols esperados de ${home} × ${away}`}>
                <div><dt>λ {home}</dt><dd>{decimal.format(expected.home)}</dd></div>
                <div><dt>λ {away}</dt><dd>{decimal.format(expected.away)}</dd></div>
              </dl>
              <ResultBar probabilities={probabilities} home={home} away={away} />
            </article>
          )
        })}
      </div>
      <p className="table-note">
        λ vem das taxas de ataque/defesa por mando regularizadas (k=20, base 2021–2026 até o corte); as barras são os
        marginais H/E/F de duas Poisson independentes. Detalhes e exemplo passo a passo na aba Metodologia &amp; Validação.
      </p>
    </section>
  )
}
