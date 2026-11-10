import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures } from './projectionData'
import { matchProbabilities } from './matchProbabilities'
import { Crest } from './Crest'
import { ZONES } from './projectionConfig'
import type { ProjectionResult } from './projection'

export type PickOutcome = 'home' | 'draw' | 'away'

export interface MatchPick {
  cbfRef: string
  pick: PickOutcome
}

interface RoundGroup {
  round: string
  roundNumber: number
  suffix: string
  fixtures: typeof remainingFixtures
}

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

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const signedPercent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })

export function MatchSimulator({ result }: { result?: ProjectionResult | null }): JSX.Element {
  const rounds = useMemo(pendingRounds, [])
  const [selectedRound, setSelectedRound] = useState(rounds[0]?.round ?? '')
  const [picks, setPicks] = useState<Map<string, PickOutcome>>(() => new Map())
  const [viewMode, setViewMode] = useState<'standings' | 'probabilities'>('standings')

  const group = rounds.find((entry) => entry.round === selectedRound) ?? rounds[0]
  const clubMap = useMemo(() => new Map(currentClubs.map((club) => [club.id, club])), [])

  const togglePick = (cbfRef: string, outcome: PickOutcome): void => {
    setPicks((prev) => {
      const next = new Map(prev)
      if (next.get(cbfRef) === outcome) {
        next.delete(cbfRef)
      } else {
        next.set(cbfRef, outcome)
      }
      return next
    })
  }

  const setScenario = (type: 'favorites' | 'underdogs' | 'home' | 'clear'): void => {
    if (!group) return
    if (type === 'clear') {
      setPicks(new Map())
      return
    }

    const next = new Map(picks)
    for (const fixture of group.fixtures) {
      if (type === 'home') {
        next.set(fixture.cbfRef, 'home')
      } else {
        const { probabilities } = matchProbabilities(fixture.home, fixture.away)
        const [homeP, drawP, awayP] = probabilities
        if (type === 'favorites') {
          const max = Math.max(homeP, drawP, awayP)
          next.set(fixture.cbfRef, max === homeP ? 'home' : max === drawP ? 'draw' : 'away')
        } else if (type === 'underdogs') {
          const min = Math.min(homeP, drawP, awayP)
          next.set(fixture.cbfRef, min === homeP ? 'home' : min === drawP ? 'draw' : 'away')
        }
      }
    }
    setPicks(next)
  }

  // Simulação rápida determinística da tabela pós-palpites
  const simulatedTable = useMemo(() => {
    const table = currentClubs.map((club) => ({
      ...club,
      originalPosition: club.position,
      simulatedPoints: club.points,
      simulatedPlayed: club.played,
      simulatedWins: club.wins,
      pointsDiff: 0,
    }))

    const clubIndexMap = new Map(table.map((c, idx) => [c.id, idx]))

    // Aplica os palpites do usuário
    for (const fixture of remainingFixtures) {
      const pick = picks.get(fixture.cbfRef)
      if (!pick) continue

      const homeClub = table[clubIndexMap.get(fixture.home)!]
      const awayClub = table[clubIndexMap.get(fixture.away)!]
      if (!homeClub || !awayClub) continue

      homeClub.simulatedPlayed += 1
      awayClub.simulatedPlayed += 1

      if (pick === 'home') {
        homeClub.simulatedPoints += 3
        homeClub.simulatedWins += 1
        homeClub.pointsDiff += 3
      } else if (pick === 'away') {
        awayClub.simulatedPoints += 3
        awayClub.simulatedWins += 1
        awayClub.pointsDiff += 3
      } else {
        homeClub.simulatedPoints += 1
        awayClub.simulatedPoints += 1
        homeClub.pointsDiff += 1
        awayClub.pointsDiff += 1
      }
    }

    // Ordena de acordo com o regulamento do Brasileirão: Pontos desc, Vitórias desc, Saldo desc
    table.sort((a, b) => {
      if (b.simulatedPoints !== a.simulatedPoints) return b.simulatedPoints - a.simulatedPoints
      if (b.simulatedWins !== a.simulatedWins) return b.simulatedWins - a.simulatedWins
      const sgA = a.goalsFor - a.goalsAgainst
      const sgB = b.goalsFor - b.goalsAgainst
      if (sgB !== sgA) return sgB - sgA
      return b.goalsFor - a.goalsFor
    })

    return table.map((team, idx) => ({
      ...team,
      simulatedPosition: idx + 1,
      positionDelta: team.originalPosition - (idx + 1), // > 0 subiu, < 0 caiu
    }))
  }, [picks])

  // Estimativa rápida de probabilidades simuladas
  const simulatedProbabilities = useMemo(() => {
    if (!result) return []

    // Fator de escala baseado na variação dos pontos simulados
    return result.clubProbabilities.map((club) => {
      const simClub = simulatedTable.find((c) => c.id === club.id)
      const pointsAdded = simClub?.pointsDiff ?? 0

      // Ajuste proporcional simplificado em tempo real
      let simTitle = club.title
      let simLibertadores = club.libertadores
      let simRelegation = club.relegation

      if (pointsAdded > 0) {
        if (club.currentPosition <= 3) {
          simTitle = Math.min(0.999, club.title * (1 + pointsAdded * 0.12))
        }
        if (club.currentPosition <= 10) {
          simLibertadores = Math.min(0.999, club.libertadores * (1 + pointsAdded * 0.08))
        }
        if (club.currentPosition >= 14) {
          simRelegation = Math.max(0.001, club.relegation * (1 - pointsAdded * 0.22))
        }
      }

      return {
        id: club.id,
        club: club.club,
        currentPosition: club.currentPosition,
        simulatedPosition: simClub?.simulatedPosition ?? club.currentPosition,
        originalTitle: club.title,
        simulatedTitle: simTitle,
        titleDelta: simTitle - club.title,
        originalRelegation: club.relegation,
        simulatedRelegation: simRelegation,
        relegationDelta: simRelegation - club.relegation,
        originalLibertadores: club.libertadores,
        simulatedLibertadores: simLibertadores,
        libertadoresDelta: simLibertadores - club.libertadores,
      }
    })
  }, [result, simulatedTable])

  const totalPicksCount = picks.size

  return (
    <section className="sim-panel panel" aria-labelledby="simulator-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow-dark">LABORATÓRIO DE CENÁRIOS</p>
          <h2 id="simulator-title">Simulador de Resultados & Probabilidades</h2>
        </div>
        <span className="section-index">SIM <span>/ INTERATIVO</span></span>
      </div>

      <p className="sim-lead">
        Escolha os resultados das partidas e acompanhe instantaneamente as mudanças na tabela de classificação e nas probabilidades matemáticas de título, Libertadores e rebaixamento.
      </p>

      {/* Toolbar do Simulador */}
      <div className="sim-toolbar">
        {group && (
          <label className="sim-round-select">
            <span>Rodada para Simular</span>
            <select
              aria-label="Selecionar rodada para simular"
              value={group.round}
              onChange={(e) => setSelectedRound(e.currentTarget.value)}
            >
              {rounds.map((entry) => (
                <option key={entry.round} value={entry.round}>
                  Rodada {entry.roundNumber}{entry.suffix ? ` (${entry.suffix})` : ''} · {entry.fixtures.length} jogos
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="sim-scenarios" role="group" aria-label="Cenários automáticos">
          <span className="sim-scenarios-label">Palpites rápidos:</span>
          <button type="button" className="sim-quick-btn" onClick={() => setScenario('favorites')}>
            ⚡ Favoritos
          </button>
          <button type="button" className="sim-quick-btn" onClick={() => setScenario('underdogs')}>
            💥 Zebras
          </button>
          <button type="button" className="sim-quick-btn" onClick={() => setScenario('home')}>
            🏠 Mandantes
          </button>
          {totalPicksCount > 0 && (
            <button type="button" className="sim-quick-btn sim-quick-btn--reset" onClick={() => setScenario('clear')}>
              ↺ Limpar ({totalPicksCount})
            </button>
          )}
        </div>
      </div>

      {/* Grid de Partidas da Rodada */}
      <div className="sim-matches-grid" aria-label="Partidas da rodada selecionada">
        {group?.fixtures.map((fixture) => {
          const home = clubMap.get(fixture.home)?.club ?? fixture.home
          const away = clubMap.get(fixture.away)?.club ?? fixture.away
          const { expected, probabilities } = matchProbabilities(fixture.home, fixture.away)
          const [homeP, drawP, awayP] = probabilities
          const activePick = picks.get(fixture.cbfRef)

          return (
            <article className={`sim-match-card ${activePick ? 'sim-match-card--has-pick' : ''}`} key={fixture.cbfRef}>
              <div className="sim-match-header">
                <span className="sim-match-venue">Rodada {group.roundNumber} · CBF #{fixture.cbfRef}</span>
                <span className="sim-match-expected">xG: {expected.home.toFixed(2)} × {expected.away.toFixed(2)}</span>
              </div>

              <div className="sim-match-teams">
                <div className="sim-team sim-team--home">
                  <Crest clubId={fixture.home} size="medium" />
                  <span className="sim-team-name">{home}</span>
                </div>
                <span className="sim-match-vs">×</span>
                <div className="sim-team sim-team--away">
                  <span className="sim-team-name">{away}</span>
                  <Crest clubId={fixture.away} size="medium" />
                </div>
              </div>

              {/* Botões 1 / X / 2 */}
              <div className="sim-pick-buttons" role="group" aria-label={`Palpite para ${home} contra ${away}`}>
                <button
                  type="button"
                  className={`sim-pick-btn ${activePick === 'home' ? 'is-selected' : ''}`}
                  onClick={() => togglePick(fixture.cbfRef, 'home')}
                  aria-pressed={activePick === 'home'}
                >
                  <span className="sim-pick-tag">1</span>
                  <span className="sim-pick-prob">{percent.format(homeP)}</span>
                </button>
                <button
                  type="button"
                  className={`sim-pick-btn ${activePick === 'draw' ? 'is-selected' : ''}`}
                  onClick={() => togglePick(fixture.cbfRef, 'draw')}
                  aria-pressed={activePick === 'draw'}
                >
                  <span className="sim-pick-tag">X</span>
                  <span className="sim-pick-prob">{percent.format(drawP)}</span>
                </button>
                <button
                  type="button"
                  className={`sim-pick-btn ${activePick === 'away' ? 'is-selected' : ''}`}
                  onClick={() => togglePick(fixture.cbfRef, 'away')}
                  aria-pressed={activePick === 'away'}
                >
                  <span className="sim-pick-tag">2</span>
                  <span className="sim-pick-prob">{percent.format(awayP)}</span>
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {/* Painel de Impacto dos Resultados */}
      <div className="sim-results-section">
        <div className="sim-results-header">
          <div>
            <h3>Impacto na Classificação ({totalPicksCount} {totalPicksCount === 1 ? 'jogo definido' : 'jogos definidos'})</h3>
            <p className="table-note">
              {totalPicksCount === 0
                ? 'Selecione os palpites acima para ver a tabela simulada e as oscilações de probabilidade.'
                : 'Tabela calculada com os pontos adicionais dos seus palpites mantendo os critérios oficiais CBF.'}
            </p>
          </div>
          <div className="sim-view-toggle" role="tablist" aria-label="Visualização do simulador">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'standings'}
              className={`filter-button ${viewMode === 'standings' ? 'is-selected' : ''}`}
              onClick={() => setViewMode('standings')}
            >
              Classificação Simulada
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'probabilities'}
              className={`filter-button ${viewMode === 'probabilities' ? 'is-selected' : ''}`}
              onClick={() => setViewMode('probabilities')}
            >
              Probabilidades Atualizadas
            </button>
          </div>
        </div>

        {viewMode === 'standings' ? (
          <div className="table-scroll" role="region" aria-label="Classificação pós-simulação" tabIndex={0}>
            <table className="standings-view-table sim-table">
              <thead>
                <tr>
                  <th scope="col" className="numeric">Pos</th>
                  <th scope="col">Mov</th>
                  <th scope="col">Clube</th>
                  <th scope="col" className="numeric">Pts</th>
                  <th scope="col" className="numeric">J</th>
                  <th scope="col" className="numeric">V</th>
                  <th scope="col" className="numeric">SG</th>
                  <th scope="col" className="numeric">Δ Pts</th>
                </tr>
              </thead>
              <tbody>
                {simulatedTable.map((team) => {
                  const isG4 = team.simulatedPosition <= ZONES.libertadores.to
                  const isSula = team.simulatedPosition <= ZONES.sudamericana.to && !isG4
                  const isZ4 = team.simulatedPosition >= ZONES.relegation.from
                  const zoneClass = isG4 ? 'qualification' : isSula ? 'sudamericana' : isZ4 ? 'relegation' : 'middle'

                  return (
                    <tr key={team.id} className={`standing-row standing-row--${zoneClass}`}>
                      <td className="position-cell numeric">
                        <span>{String(team.simulatedPosition).padStart(2, '0')}</span>
                      </td>
                      <td className="sim-mov-cell">
                        {team.positionDelta > 0 ? (
                          <span className="sim-delta-badge sim-delta-badge--up" title={`Subiu ${team.positionDelta} posições`}>
                            ▲ {team.positionDelta}
                          </span>
                        ) : team.positionDelta < 0 ? (
                          <span className="sim-delta-badge sim-delta-badge--down" title={`Caiu ${Math.abs(team.positionDelta)} posições`}>
                            ▼ {Math.abs(team.positionDelta)}
                          </span>
                        ) : (
                          <span className="sim-delta-badge sim-delta-badge--neutral" title="Mesma posição">
                            •
                          </span>
                        )}
                      </td>
                      <th scope="row" className="club-cell">
                        <Crest clubId={team.id} size="xs" />
                        <span className="club-cell-name">{team.club}</span>
                        {team.simulatedPosition !== team.originalPosition && (
                          <span className="sim-original-pos">({team.originalPosition}º oficial)</span>
                        )}
                      </th>
                      <td className="numeric points-cell"><strong>{team.simulatedPoints}</strong></td>
                      <td className="numeric games-cell">{team.simulatedPlayed}</td>
                      <td className="numeric games-cell">{team.simulatedWins}</td>
                      <td className="numeric games-cell">{team.goalsFor - team.goalsAgainst}</td>
                      <td className="numeric games-cell sim-pts-delta">
                        {team.pointsDiff > 0 ? `+${team.pointsDiff}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-scroll" role="region" aria-label="Probabilidades estimadas pós-simulação" tabIndex={0}>
            <table className="projection-table sim-table">
              <thead>
                <tr>
                  <th scope="col" className="numeric">Pos</th>
                  <th scope="col">Clube</th>
                  <th scope="col" className="numeric">Título %</th>
                  <th scope="col" className="numeric">Libertadores %</th>
                  <th scope="col" className="numeric">Rebaixamento %</th>
                </tr>
              </thead>
              <tbody>
                {simulatedProbabilities.map((team) => (
                  <tr key={team.id}>
                    <td className="position-cell numeric">{String(team.simulatedPosition).padStart(2, '0')}</td>
                    <th scope="row" className="club-cell">
                      <Crest clubId={team.id} size="xs" />
                      <span className="club-cell-name">{team.club}</span>
                    </th>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.simulatedTitle)}</strong>
                      {Math.abs(team.titleDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.titleDelta > 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.titleDelta)}
                        </span>
                      )}
                    </td>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.simulatedLibertadores)}</strong>
                      {Math.abs(team.libertadoresDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.libertadoresDelta > 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.libertadoresDelta)}
                        </span>
                      )}
                    </td>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.simulatedRelegation)}</strong>
                      {Math.abs(team.relegationDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.relegationDelta < 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.relegationDelta)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
