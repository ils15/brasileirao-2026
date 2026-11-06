import type { JSX } from 'react'

/**
 * Placar com o número do vencedor em verde, o do perdedor em vermelho e
 * empate neutro — leitura instantânea de quem ganhou em qualquer tabela.
 * `perspectiveHome` é o clube do lado esquerdo do placar.
 */
export function ScoreLine({ homeGoals, awayGoals, perspectiveHome = true }: { homeGoals: number; awayGoals: number; perspectiveHome?: boolean }): JSX.Element {
  const ownWin = homeGoals > awayGoals
  const ownLoss = homeGoals < awayGoals
  const firstIsWinner = perspectiveHome ? ownWin : ownLoss
  const secondIsWinner = perspectiveHome ? ownLoss : ownWin
  return (
    <span className={`score-line ${ownWin || ownLoss ? 'score-line--decided' : 'score-line--draw'}`}>
      <span className={`score-part ${firstIsWinner ? 'score-part--win' : secondIsWinner ? 'score-part--loss' : 'score-part--draw'}`}>{homeGoals}</span>
      <span className="score-sep">–</span>
      <span className={`score-part ${secondIsWinner ? 'score-part--win' : firstIsWinner ? 'score-part--loss' : 'score-part--draw'}`}>{awayGoals}</span>
    </span>
  )
}
