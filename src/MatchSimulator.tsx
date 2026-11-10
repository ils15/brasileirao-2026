import { useMemo, useState, type JSX } from 'react'
import { currentClubs, remainingFixtures } from './projectionData'
import { matchProbabilities } from './matchProbabilities'
import { Crest } from './Crest'
import { ZONES, SIMULATION_SEED } from './projectionConfig'
import { runScenarioProjection, type ProjectionResult, type UserScore } from './projection'

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
  const [picks, setPicks] = useState<Map<string, UserScore>>(() => new Map())
  const [viewMode, setViewMode] = useState<'standings' | 'probabilities'>('standings')

  const group = rounds.find((entry) => entry.round === selectedRound) ?? rounds[0]
  const clubMap = useMemo(() => new Map(currentClubs.map((club) => [club.id, club])), [])

  // Incrementa/decrementa gols partindo do placar projetado ou do placar atual
  const adjustGoals = (
    cbfRef: string,
    side: 'home' | 'away',
    delta: number,
    projected: { homeGoals: number; awayGoals: number },
  ): void => {
    setPicks((prev) => {
      const next = new Map(prev)
      const current = next.get(cbfRef) ?? projected
      const newHome = side === 'home' ? Math.max(0, Math.min(9, current.homeGoals + delta)) : current.homeGoals
      const newAway = side === 'away' ? Math.max(0, Math.min(9, current.awayGoals + delta)) : current.awayGoals
      next.set(cbfRef, { homeGoals: newHome, awayGoals: newAway })
      return next
    })
  }

  // Seleciona desfecho com o placar mais provável do modelo para aquele desfecho
  const toggleOutcome = (
    cbfRef: string,
    outcome: 'home' | 'draw' | 'away',
    score: { homeGoals: number; awayGoals: number },
  ): void => {
    setPicks((prev) => {
      const next = new Map(prev)
      const current = next.get(cbfRef)
      if (current) {
        const curOutcome = current.homeGoals > current.awayGoals ? 'home' : current.homeGoals === current.awayGoals ? 'draw' : 'away'
        if (curOutcome === outcome) {
          next.delete(cbfRef)
          return next
        }
      }
      next.set(cbfRef, { homeGoals: score.homeGoals, awayGoals: score.awayGoals })
      return next
    })
  }

  const clearPick = (cbfRef: string): void => {
    setPicks((prev) => {
      const next = new Map(prev)
      next.delete(cbfRef)
      return next
    })
  }

  const setScenario = (type: 'modal' | 'favorites' | 'underdogs' | 'home' | 'clear'): void => {
    if (!group) return
    if (type === 'clear') {
      setPicks(new Map())
      return
    }

    const next = new Map(picks)
    for (const fixture of group.fixtures) {
      const { probabilities, mostProbable } = matchProbabilities(fixture.home, fixture.away)
      const [homeP, drawP, awayP] = probabilities

      if (type === 'modal') {
        // Moda conjunta do confronto: placar mais provável segundo o modelo
        next.set(fixture.cbfRef, {
          homeGoals: mostProbable.overall.homeGoals,
          awayGoals: mostProbable.overall.awayGoals,
        })
      } else if (type === 'home') {
        // Vitória do mandante calibrada por ataque vs defesa
        next.set(fixture.cbfRef, {
          homeGoals: mostProbable.homeWin.homeGoals,
          awayGoals: mostProbable.homeWin.awayGoals,
        })
      } else if (type === 'favorites') {
        const max = Math.max(homeP, drawP, awayP)
        if (max === homeP) {
          next.set(fixture.cbfRef, {
            homeGoals: mostProbable.homeWin.homeGoals,
            awayGoals: mostProbable.homeWin.awayGoals,
          })
        } else if (max === drawP) {
          next.set(fixture.cbfRef, {
            homeGoals: mostProbable.draw.homeGoals,
            awayGoals: mostProbable.draw.awayGoals,
          })
        } else {
          next.set(fixture.cbfRef, {
            homeGoals: mostProbable.awayWin.homeGoals,
            awayGoals: mostProbable.awayWin.awayGoals,
          })
        }
      } else if (type === 'underdogs') {
        const min = Math.min(homeP, drawP, awayP)
        if (min === homeP) {
          next.set(fixture.cbfRef, {
            homeGoals: mostProbable.homeWin.homeGoals,
            awayGoals: mostProbable.homeWin.awayGoals,
          })
        } else if (min === drawP) {
          next.set(fixture.cbfRef, {
            homeGoals: mostProbable.draw.homeGoals,
            awayGoals: mostProbable.draw.awayGoals,
          })
        } else {
          next.set(fixture.cbfRef, {
            homeGoals: mostProbable.awayWin.homeGoals,
            awayGoals: mostProbable.awayWin.awayGoals,
          })
        }
      }
    }
    setPicks(next)
  }

  // Executa o motor Monte Carlo determinístico com os placares do usuário
  const scenarioProbabilities = useMemo(() => {
    return runScenarioProjection(picks, 2000, SIMULATION_SEED)
  }, [picks])

  // Classificação ordenada pelos critérios do Brasileirão com os jogos simulados
  const simulatedTable = useMemo(() => {
    const list = [...scenarioProbabilities]
    list.sort((a, b) => {
      if (b.simulatedPoints !== a.simulatedPoints) return b.simulatedPoints - a.simulatedPoints
      if (b.simulatedWins !== a.simulatedWins) return b.simulatedWins - a.simulatedWins
      if (b.simulatedGoalDifference !== a.simulatedGoalDifference) return b.simulatedGoalDifference - a.simulatedGoalDifference
      return b.simulatedGoalsFor - a.simulatedGoalsFor
    })
    return list.map((item, idx) => ({
      ...item,
      simulatedPosition: idx + 1,
      positionDelta: item.currentPosition - (idx + 1), // > 0 subiu, < 0 caiu
    }))
  }, [scenarioProbabilities])

  // Probabilidades com deltas em relação à projeção estática oficial
  const simulatedProbabilitiesList = useMemo(() => {
    const originalMap = new Map(result?.clubProbabilities.map((c) => [c.id, c]) ?? [])
    return simulatedTable.map((team) => {
      const orig = originalMap.get(team.id)
      const origTitle = orig?.title ?? 0
      const origLib = orig?.libertadores ?? 0
      const origSula = orig?.sudamericana ?? 0
      const origRel = orig?.relegation ?? 0

      return {
        ...team,
        origTitle,
        titleDelta: team.title - origTitle,
        origLib,
        libDelta: team.libertadores - origLib,
        origSula,
        sulaDelta: team.sudamericana - origSula,
        origRel,
        relDelta: team.relegation - origRel,
      }
    })
  }, [simulatedTable, result])

  const totalPicksCount = picks.size

  return (
    <section className="sim-panel panel" aria-labelledby="simulator-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow-dark">LABORATÓRIO DE CENÁRIOS & PLACARES</p>
          <h2 id="simulator-title">Simulador Interativo do Brasileirão</h2>
        </div>
        <span className="section-index">SIM <span>/ MONTE CARLO</span></span>
      </div>

      <p className="sim-lead">
        Defina os placares e resultados das partidas rodada a rodada. Acompanhe em tempo real os impactos na pontuação, saldo de gols e nas probabilidades matemáticas de título, Libertadores e rebaixamento calculadas por Monte Carlo.
      </p>

      {/* Toolbar do Simulador */}
      <div className="sim-toolbar">
        {group && (
          <label className="sim-round-select">
            <span>Rodada:</span>
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
          <span className="sim-scenarios-label">Preenchimento rápido:</span>
          <button
            type="button"
            className="sim-quick-btn"
            onClick={() => setScenario('modal')}
            title="Preenche cada confronto com o placar de maior probabilidade segundo o modelo de gols esperados"
          >
            🎯 Mais Prováveis
          </button>
          <button
            type="button"
            className="sim-quick-btn"
            onClick={() => setScenario('favorites')}
            title="Aplica a vitória do favorito com seu placar esperado"
          >
            ⚡ Favoritos
          </button>
          <button
            type="button"
            className="sim-quick-btn"
            onClick={() => setScenario('underdogs')}
            title="Aplica o resultado zebra com seu placar esperado"
          >
            💥 Zebras
          </button>
          <button
            type="button"
            className="sim-quick-btn"
            onClick={() => setScenario('home')}
            title="Aplica vitórias dos mandantes calibradas por ataque vs defesa"
          >
            🏠 Mandantes
          </button>
          {totalPicksCount > 0 && (
            <button
              type="button"
              className="sim-quick-btn sim-quick-btn--reset"
              onClick={() => setScenario('clear')}
              title="Limpar todos os palpites da rodada"
            >
              ↺ Limpar ({totalPicksCount})
            </button>
          )}
        </div>
      </div>

      {/* Grid de Duelos da Rodada */}
      <div className="sim-matches-grid" aria-label="Partidas da rodada selecionada">
        {group?.fixtures.map((fixture) => {
          const homeClub = clubMap.get(fixture.home)
          const awayClub = clubMap.get(fixture.away)
          const homeName = homeClub?.club ?? fixture.home
          const awayName = awayClub?.club ?? fixture.away
          const { expected, probabilities, mostProbable } = matchProbabilities(fixture.home, fixture.away)
          const [homeP, drawP, awayP] = probabilities

          const score = picks.get(fixture.cbfRef)
          const activeOutcome = score !== undefined
            ? score.homeGoals > score.awayGoals
              ? 'home'
              : score.homeGoals === score.awayGoals
                ? 'draw'
                : 'away'
            : null

          return (
            <article className={`sim-match-card ${score !== undefined ? 'sim-match-card--has-pick' : ''}`} key={fixture.cbfRef}>
              <div className="sim-match-header">
                <span className="sim-match-venue">Rodada {group.roundNumber} · CBF #{fixture.cbfRef}</span>
                <div className="sim-match-meta">
                  <span
                    className="sim-match-xg"
                    title={`Gols esperados (xG) baseados em ataque e defesa: ${homeName} ${expected.home.toFixed(2)} × ${expected.away.toFixed(2)} ${awayName}. Placar mais provável conjunto (moda): ${mostProbable.overall.homeGoals} × ${mostProbable.overall.awayGoals} (${(mostProbable.overall.probability * 100).toFixed(1)}%)`}
                  >
                    xG: <strong>{expected.home.toFixed(2)}</strong> × <strong>{expected.away.toFixed(2)}</strong>
                  </span>
                  {score !== undefined && (
                    <button
                      type="button"
                      className="sim-match-clear"
                      onClick={() => clearPick(fixture.cbfRef)}
                      title="Remover palpite deste jogo"
                    >
                      ✕ Limpar
                    </button>
                  )}
                </div>
              </div>

              {/* Duelo com Escudos, Nomes, Pontuação Atual e Controle de Gols */}
              <div className="sim-duel-box">
                <div className={`sim-team-side sim-team-side--home ${activeOutcome === 'home' ? 'is-winner' : ''}`}>
                  <Crest clubId={fixture.home} size="xs" />
                  <div className="sim-team-info">
                    <span className="sim-team-name">{homeName}</span>
                    <span className="sim-team-points">
                      {homeClub ? `${homeClub.position}º · ${homeClub.points} pts (SG ${homeClub.goalsFor - homeClub.goalsAgainst >= 0 ? '+' : ''}${homeClub.goalsFor - homeClub.goalsAgainst})` : ''}
                    </span>
                  </div>
                </div>

                {/* Placar Interativo com Ajuste de Gols (+/-) */}
                <div className="sim-score-box">
                  <div className="sim-stepper">
                    <button
                      type="button"
                      className="sim-step-btn"
                      onClick={() => adjustGoals(fixture.cbfRef, 'home', -1, mostProbable.overall)}
                      aria-label={`Diminuir gol de ${homeName}`}
                    >−</button>
                    <span
                      className={`sim-score-val ${score !== undefined ? 'has-score' : 'is-placeholder'}`}
                      title={score !== undefined ? `Placar selecionado: ${score.homeGoals}` : `Placar provável projetado: ${mostProbable.overall.homeGoals}`}
                    >
                      {score !== undefined ? score.homeGoals : mostProbable.overall.homeGoals}
                    </span>
                    <button
                      type="button"
                      className="sim-step-btn"
                      onClick={() => adjustGoals(fixture.cbfRef, 'home', 1, mostProbable.overall)}
                      aria-label={`Aumentar gol de ${homeName}`}
                    >+</button>
                  </div>
                  <span className="sim-score-x">×</span>
                  <div className="sim-stepper">
                    <button
                      type="button"
                      className="sim-step-btn"
                      onClick={() => adjustGoals(fixture.cbfRef, 'away', -1, mostProbable.overall)}
                      aria-label={`Diminuir gol de ${awayName}`}
                    >−</button>
                    <span
                      className={`sim-score-val ${score !== undefined ? 'has-score' : 'is-placeholder'}`}
                      title={score !== undefined ? `Placar selecionado: ${score.awayGoals}` : `Placar provável projetado: ${mostProbable.overall.awayGoals}`}
                    >
                      {score !== undefined ? score.awayGoals : mostProbable.overall.awayGoals}
                    </span>
                    <button
                      type="button"
                      className="sim-step-btn"
                      onClick={() => adjustGoals(fixture.cbfRef, 'away', 1, mostProbable.overall)}
                      aria-label={`Aumentar gol de ${awayName}`}
                    >+</button>
                  </div>
                </div>

                <div className={`sim-team-side sim-team-side--away ${activeOutcome === 'away' ? 'is-winner' : ''}`}>
                  <div className="sim-team-info text-right">
                    <span className="sim-team-name">{awayName}</span>
                    <span className="sim-team-points">
                      {awayClub ? `${awayClub.position}º · ${awayClub.points} pts (SG ${awayClub.goalsFor - awayClub.goalsAgainst >= 0 ? '+' : ''}${awayClub.goalsFor - awayClub.goalsAgainst})` : ''}
                    </span>
                  </div>
                  <Crest clubId={fixture.away} size="xs" />
                </div>
              </div>

              {/* Botões Semânticos de Desfecho com Placares Mais Prováveis */}
              <div className="sim-outcome-buttons" role="group" aria-label={`Palpite para ${homeName} contra ${awayName}`}>
                <button
                  type="button"
                  className={`sim-outcome-btn ${activeOutcome === 'home' ? 'is-selected is-home' : ''}`}
                  onClick={() => toggleOutcome(fixture.cbfRef, 'home', mostProbable.homeWin)}
                  aria-pressed={activeOutcome === 'home'}
                  title={`Vitória do mandante com placar mais provável (${mostProbable.homeWin.homeGoals}×${mostProbable.homeWin.awayGoals}) baseado no xG de ataque vs defesa`}
                >
                  <span className="sim-outcome-title">Vitória {homeName.split(' ')[0]}</span>
                  <span className="sim-outcome-prob">
                    <strong>{mostProbable.homeWin.homeGoals}×{mostProbable.homeWin.awayGoals}</strong> · {percent.format(homeP)}
                  </span>
                </button>
                <button
                  type="button"
                  className={`sim-outcome-btn ${activeOutcome === 'draw' ? 'is-selected is-draw' : ''}`}
                  onClick={() => toggleOutcome(fixture.cbfRef, 'draw', mostProbable.draw)}
                  aria-pressed={activeOutcome === 'draw'}
                  title={`Empate com placar mais provável (${mostProbable.draw.homeGoals}×${mostProbable.draw.awayGoals}) baseado no xG`}
                >
                  <span className="sim-outcome-title">Empate</span>
                  <span className="sim-outcome-prob">
                    <strong>{mostProbable.draw.homeGoals}×{mostProbable.draw.awayGoals}</strong> · {percent.format(drawP)}
                  </span>
                </button>
                <button
                  type="button"
                  className={`sim-outcome-btn ${activeOutcome === 'away' ? 'is-selected is-away' : ''}`}
                  onClick={() => toggleOutcome(fixture.cbfRef, 'away', mostProbable.awayWin)}
                  aria-pressed={activeOutcome === 'away'}
                  title={`Vitória do visitante com placar mais provável (${mostProbable.awayWin.homeGoals}×${mostProbable.awayWin.awayGoals}) baseado no xG`}
                >
                  <span className="sim-outcome-title">Vitória {awayName.split(' ')[0]}</span>
                  <span className="sim-outcome-prob">
                    <strong>{mostProbable.awayWin.homeGoals}×{mostProbable.awayWin.awayGoals}</strong> · {percent.format(awayP)}
                  </span>
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
            <h3>Impacto na Classificação & Probabilidades ({totalPicksCount} {totalPicksCount === 1 ? 'jogo definido' : 'jogos definidos'})</h3>
            <p className="table-note">
              {totalPicksCount === 0
                ? 'Selecione os vencedores ou ajuste os placares acima para ver o recálculo imediato de pontos e probabilidades Monte Carlo.'
                : 'Tabela calculada com os placares definidos, aplicando saldo de gols, vitórias e todos os critérios oficiais CBF.'}
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
                  <th scope="col" className="numeric">#</th>
                  <th scope="col">Mov</th>
                  <th scope="col">Clube</th>
                  <th scope="col" className="numeric">Pts Atual</th>
                  <th scope="col" className="numeric">Pts Sim.</th>
                  <th scope="col" className="numeric">Δ Pts</th>
                  <th scope="col" className="numeric">J</th>
                  <th scope="col" className="numeric">V</th>
                  <th scope="col" className="numeric">SG</th>
                  <th scope="col" className="numeric">GP</th>
                  <th scope="col" className="numeric">GC</th>
                </tr>
              </thead>
              <tbody>
                {simulatedTable.map((team, index) => {
                  const isG4 = index + 1 <= ZONES.libertadores.to
                  const isSula = index + 1 <= ZONES.sudamericana.to && !isG4
                  const isZ4 = index + 1 >= ZONES.relegation.from
                  const zoneClass = isG4 ? 'qualification' : isSula ? 'sudamericana' : isZ4 ? 'relegation' : 'middle'

                  return (
                    <tr key={team.id} className={`standing-row standing-row--${zoneClass}`}>
                      <td className="position-cell numeric">
                        <span>{String(index + 1).padStart(2, '0')}</span>
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
                        {index + 1 !== team.currentPosition && (
                          <span className="official-pos-badge" title={`Posição oficial no campeonato: ${team.currentPosition}º`}>
                            {team.currentPosition}º oficial
                          </span>
                        )}
                      </th>
                      <td className="numeric games-cell">{team.currentPoints}</td>
                      <td className="numeric points-cell"><strong>{team.simulatedPoints}</strong></td>
                      <td className="numeric games-cell sim-pts-delta">
                        {team.pointsDiff > 0 ? `+${team.pointsDiff}` : '—'}
                      </td>
                      <td className="numeric games-cell">{team.currentPosition}</td>
                      <td className="numeric games-cell">{team.simulatedWins}</td>
                      <td className="numeric games-cell">
                        {team.simulatedGoalDifference > 0 ? `+${team.simulatedGoalDifference}` : team.simulatedGoalDifference}
                      </td>
                      <td className="numeric games-cell">{team.simulatedGoalsFor}</td>
                      <td className="numeric games-cell">{team.simulatedGoalsAgainst}</td>
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
                  <th scope="col" className="numeric">#</th>
                  <th scope="col">Clube</th>
                  <th scope="col" className="numeric">Pts Atual</th>
                  <th scope="col" className="numeric">Pts Sim.</th>
                  <th scope="col" className="numeric">Título %</th>
                  <th scope="col" className="numeric">Libertadores %</th>
                  <th scope="col" className="numeric">Sul-Americana %</th>
                  <th scope="col" className="numeric">Rebaixamento %</th>
                </tr>
              </thead>
              <tbody>
                {simulatedProbabilitiesList.map((team, index) => (
                  <tr key={team.id}>
                    <td className="position-cell numeric">{String(index + 1).padStart(2, '0')}</td>
                    <th scope="row" className="club-cell">
                      <Crest clubId={team.id} size="xs" />
                      <span className="club-cell-name">{team.club}</span>
                      {index + 1 !== team.currentPosition && (
                        <span className="official-pos-badge" title={`Posição oficial no campeonato: ${team.currentPosition}º`}>
                          {team.currentPosition}º oficial
                        </span>
                      )}
                    </th>
                    <td className="numeric games-cell">{team.currentPoints}</td>
                    <td className="numeric points-cell"><strong>{team.simulatedPoints}</strong></td>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.title)}</strong>
                      {Math.abs(team.titleDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.titleDelta > 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.titleDelta)}
                        </span>
                      )}
                    </td>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.libertadores)}</strong>
                      {Math.abs(team.libDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.libDelta > 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.libDelta)}
                        </span>
                      )}
                    </td>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.sudamericana)}</strong>
                      {Math.abs(team.sulaDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.sulaDelta > 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.sulaDelta)}
                        </span>
                      )}
                    </td>
                    <td className="numeric probability-cell">
                      <strong>{percent.format(team.relegation)}</strong>
                      {Math.abs(team.relDelta) >= 0.005 && (
                        <span className={`sim-pct-delta ${team.relDelta < 0 ? 'is-up' : 'is-down'}`}>
                          {signedPercent.format(team.relDelta)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Nota Metodológica Transparente */}
        <details className="clean-disclosure sim-methodology-note">
          <summary>ℹ️ Metodologia e Parâmetros do Simulador Monte Carlo</summary>
          <div className="sim-methodology-body">
            <p>
              <strong>Placares Baseados em Gols Esperados (xG), Ataque e Defesa:</strong> Os placares sugeridos e aplicados nos botões de vitória/empate não utilizam valores fixos genéricos. Eles calculam a <em>moda estatística</em> (o placar de maior probabilidade) da distribuição bivariada Poisson a partir das taxas de gols esperados (\(\lambda\)) de cada clube, combinando a força de ataque do mandante com a fragilidade defensiva do visitante e vice-versa.
            </p>
            <p>
              <strong>Semente Determinística Única (<code>{SIMULATION_SEED}</code>):</strong> Todas as simulações executam 2.000 iterações Monte Carlo completas no seu navegador com a mesma semente pseudoaleatória do modelo oficial, garantindo reprodutibilidade estrita (os mesmos palpites produzem rigorosamente os mesmos números).
            </p>
            <p>
              <strong>Placares e Gols Reais:</strong> Os jogos que você define têm seus placares fixados exatamente nos gols informados, alterando pontos, vitórias, gols marcados, gols sofridos e saldo de gols. As demais partidas não definidas são simuladas estocasticamente pela distribuição Poisson com Expected Goals (xG) ajustados por mando de campo.
            </p>
            <p>
              <strong>Critérios Oficiais CBF (Art. 15):</strong> Pontos, Vitórias, Saldo de Gols, Gols Marcados e Confronto Direto são aplicados em cada uma das 2.000 temporadas simuladas para determinar as probabilidades de Título (1º), Libertadores (1º–6º*), Sul-Americana (7º–12º) e Rebaixamento (17º–20º).
            </p>
          </div>
        </details>
      </div>
    </section>
  )
}
