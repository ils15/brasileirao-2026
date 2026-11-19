import { useState, type JSX } from 'react'

import type { Scorer } from './data'
import { InfoIcon } from './icons'
import { scorersCaptureLabel, scorersCaptureRelation, scorersCoverageNote } from './seasonFacts'

const ESPN_URL = 'https://www.espn.com.br/futebol/estatisticas/_/liga/BRA.1/vista/gols'
const SCORERS_PER_PAGE = 20

export interface ScorersSource {
  name: string
}

/**
 * Painel de artilharia. A fonte é coletada por partida e pode falhar: com a
 * lista vazia o painel declara indisponibilidade em vez de paginar "0 de 0".
 */
export function ScorersPanel({ scorers, source }: { scorers: readonly Scorer[]; source: ScorersSource }): JSX.Element {
  const [scorerPage, setScorerPage] = useState(0)
  const scorerPageCount = Math.max(1, Math.ceil(scorers.length / SCORERS_PER_PAGE))
  const scorerPageStart = scorerPage * SCORERS_PER_PAGE
  const visibleScorers = scorers.slice(scorerPageStart, scorerPageStart + SCORERS_PER_PAGE)
  const scorerRangeStart = scorers.length === 0 ? 0 : scorerPageStart + 1
  const scorerRangeEnd = Math.min(scorerPageStart + SCORERS_PER_PAGE, scorers.length)
  const unavailable = scorers.length === 0

  return (
    <section className="scorers-panel panel" id="artilharia" aria-labelledby="scorers-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">QUEM FAZ A DIFERENÇA</p><h2 id="scorers-title">Artilharia</h2></div>
        <span className="section-index">02 <span>/ GOLS</span></span>
      </div>
      {unavailable ? (
        <p className="empty-state scorers-unavailable" role="status">
          Artilharia indisponível nesta captura — a fonte de eventos de partida não respondeu.
        </p>
      ) : (
        <>
          <ol className="scorer-list" id="scorer-list" aria-label="Artilharia">
            {visibleScorers.map((scorer, index) => (
              <li className="scorer-item" key={`${scorer.name}-${scorer.club}`}>
                <span className="scorer-rank">{scorer.position}</span>
                <span className={`scorer-avatar scorer-avatar--${scorerPageStart + index + 1}`} aria-hidden="true">{scorer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                <span className="scorer-info"><strong>{scorer.name}</strong><small>{scorer.club}</small></span>
                <span className="goal-count"><strong>{scorer.goals}</strong><small>gols</small></span>
              </li>
            ))}
          </ol>
          <nav className="scorer-pagination" aria-label="Paginação da artilharia">
            <button
              className="filter-button"
              type="button"
              aria-label="Página anterior da artilharia"
              aria-controls="scorer-list"
              disabled={scorerPage === 0}
              onClick={() => setScorerPage((page) => Math.max(0, page - 1))}
            >Anterior</button>
            <button
              className="filter-button"
              type="button"
              aria-label="Próxima página da artilharia"
              aria-controls="scorer-list"
              disabled={scorerPage >= scorerPageCount - 1}
              onClick={() => setScorerPage((page) => Math.min(scorerPageCount - 1, page + 1))}
            >Próxima</button>
            <span className="scorer-pagination-status" aria-live="polite" aria-atomic="true">
              <span>{scorerRangeStart}–{scorerRangeEnd} de {scorers.length}</span>
              <span aria-current="page">Página {scorerPage + 1} de {scorerPageCount}</span>
            </span>
          </nav>
        </>
      )}
      <details className="clean-disclosure">
        <summary><InfoIcon className="inline-icon" /> Fontes e critérios da artilharia</summary>
        <p className="scorers-caption">Lista informativa da temporada; captura declarada, não representa a artilharia no corte.</p>
        <p className="scorers-source-note">Fonte: {source.name} · captura {scorersCaptureLabel} · {scorersCaptureRelation}; {scorersCoverageNote}.</p>
        <div className="tie-note"><span aria-hidden="true">↗</span> Posições empatadas exibidas sem exclusões.</div>
      </details>
      <a className="text-link" href={ESPN_URL} target="_blank" rel="noreferrer">Ver estatísticas na ESPN <span aria-hidden="true">↗</span></a>
    </section>
  )
}
