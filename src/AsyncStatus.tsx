import type { JSX } from 'react'

export type AsyncPhase = 'loading' | 'error'

/**
 * Formulação única das superfícies que esperam o worker de simulações: a
 * mensagem de carga é a mesma em Projeções, Metodologia e Jogos, e a falha
 * começa sempre pela mesma frase (a consequência de cada painel vem depois).
 */
export const SIMULATIONS_LOADING = 'Carregando simulações…'
export const SIMULATIONS_UNAVAILABLE = 'Não foi possível executar as simulações neste navegador.'

/** Carregar anuncia em `role="status"`; falhar exige `role="alert"` e ação. */
export type AsyncStatusProps =
  | { phase: 'loading'; message: string }
  | { phase: 'error'; message: string; onRetry: () => void }

/**
 * Estado assíncrono padronizado: as superfícies não repetem marcação nem
 * papéis, e o erro nunca aparece sem o caminho de recuperação.
 */
export function AsyncStatus(props: AsyncStatusProps): JSX.Element {
  if (props.phase === 'loading') {
    return <p className="projection-status" role="status">{props.message}</p>
  }
  return (
    <div className="projection-status projection-error" role="alert">
      <p>{props.message}</p>
      <button className="filter-button" type="button" onClick={props.onRetry}>Tentar novamente</button>
    </div>
  )
}
