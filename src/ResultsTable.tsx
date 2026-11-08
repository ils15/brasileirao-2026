import { useMemo, useState, type JSX } from 'react'
import { currentSeasonResults, type CurrentSeasonMatch } from './currentSeasonResults'
import { currentClubs, espnLogoUrl } from './projectionData'
import { cutoffLabel } from './seasonFacts'
import { ScoreLine } from './ScoreLine'
import { filterAtOrBeforeAnalyticalCutoff } from './sourceMetadata'
import { EmptyState } from './EmptyState'
import { useTableSort, type SortableColumn } from './useTableSort'

const PAGE_SIZE = 25

function formatKickoff(kickoff: string): string {
  return kickoff.replace('T', ' ').replace(/Z$/, '') + (kickoff.endsWith('Z') ? ' UTC' : '')
}

const SOURCE_LABELS: Record<CurrentSeasonMatch['source'], string> = {
  'football-data': 'Football-Data',
  espn: 'ESPN',
}

type ResultRow = CurrentSeasonMatch

const columns: SortableColumn<ResultRow>[] = [
  { id: 'kickoff', header: 'Data/hora na fonte', accessor: ({ kickoff }) => kickoff, numeric: false },
  { id: 'home', header: 'Mandante', accessor: ({ home }) => home, numeric: false },
  { id: 'goals', header: 'Placar', accessor: ({ homeGoals, awayGoals }) => homeGoals - awayGoals, numeric: true },
  { id: 'away', header: 'Visitante', accessor: ({ away }) => away, numeric: false },
  { id: 'source', header: 'Fonte', accessor: ({ source }) => source, numeric: false },
]

/**
 * Log completo dos resultados até o corte analítico, com filtros por
 * clube, fonte e período, colunas ordenáveis e paginação.
 */
export function ResultsTable({ matches = currentSeasonResults }: { matches?: readonly CurrentSeasonMatch[] }): JSX.Element {
  const [clubFilter, setClubFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | CurrentSeasonMatch['source']>('all')
  const [fromDate, setFromDate] = useState('')
  const [page, setPage] = useState(0)

  const cutoffMatches = useMemo(() => filterAtOrBeforeAnalyticalCutoff(matches), [matches])
  const clubOptions = useMemo(() => [...currentClubs].sort((left, right) => left.club.localeCompare(right.club, 'pt-BR')), [])
  const nameFor = useMemo(() => new Map(currentClubs.map(({ id, club }) => [id, club])), [])
  const crestFor = (clubId: string): JSX.Element | null => {
    const logo = espnLogoUrl(clubId)
    return logo
      ? <img className="crest crest--xs" src={logo} alt="" aria-hidden="true" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />
      : null
  }

  const filtered = useMemo(() => {
    return cutoffMatches.filter((match) => {
      if (clubFilter !== 'all' && match.home !== clubFilter && match.away !== clubFilter) return false
      if (sourceFilter !== 'all' && match.source !== sourceFilter) return false
      if (fromDate && match.kickoff.slice(0, 10) < fromDate) return false
      return true
    })
  }, [cutoffMatches, clubFilter, sourceFilter, fromDate])

  const { sortedRows, toggleSort, ariaSort } = useTableSort(filtered, columns, 'kickoff', 'descending')
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * PAGE_SIZE
  const visibleRows = sortedRows.slice(pageStart, pageStart + PAGE_SIZE)

  function resetFilters(): void {
    setClubFilter('all')
    setSourceFilter('all')
    setFromDate('')
    setPage(0)
  }

  const filtersActive = clubFilter !== 'all' || sourceFilter !== 'all' || fromDate !== ''

  return (
    <section className="panel results-panel" id="resultados" aria-labelledby="results-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">LOG DE RESULTADOS</p><h2 id="results-title">Resultados 2026</h2></div>
        <span className="section-index">02 <span>/ JOGOS</span></span>
      </div>
      <p className="table-note">
        Todos os {cutoffMatches.length} resultados até o corte analítico ({cutoffLabel}), com fonte de cada placar.
        Data/hora na fonte não é programação CBF: ESPN usa UTC; Football-Data não declara fuso. A Tabela Básica prevê datas sujeitas a mudança.
        REF 340: CBF lista 04/11 ou 05/11; o registro ESPN local informa 2026-11-03T22:30Z (19:30 BRT). O pacote não confirma o kickoff oficial.
        Cada linha mantém sua referência original (linha do CSV ou evento ESPN).
      </p>

      <div className="results-filters" role="group" aria-label="Filtros dos resultados">
        <label>
          <span>Clube</span>
          <select aria-label="Filtrar resultados por clube" value={clubFilter}
            onChange={(event) => { setClubFilter(event.currentTarget.value); setPage(0) }}>
            <option value="all">Todos os clubes</option>
            {clubOptions.map((club) => <option key={club.id} value={club.id}>{club.club}</option>)}
          </select>
        </label>
        <label>
          <span>Fonte</span>
          <select aria-label="Filtrar resultados por fonte" value={sourceFilter}
            onChange={(event) => { setSourceFilter(event.currentTarget.value as typeof sourceFilter); setPage(0) }}>
            <option value="all">Todas as fontes</option>
            <option value="football-data">Football-Data</option>
            <option value="espn">ESPN</option>
          </select>
        </label>
        <label>
          <span>A partir de</span>
          <input type="date" aria-label="Filtrar resultados a partir da data" value={fromDate}
            onChange={(event) => { setFromDate(event.currentTarget.value); setPage(0) }} />
        </label>
        {filtersActive && (
          <button type="button" className="filter-button" onClick={resetFilters}>Limpar filtros</button>
        )}
      </div>

      <p className="result-count" aria-live="polite">
        {filtered.length === cutoffMatches.length
          ? `${filtered.length} resultados`
          : `${filtered.length} de ${cutoffMatches.length} resultados`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum resultado para estes filtros"
          description={`Ajuste o clube, a fonte ou a data inicial — o log cobre ${cutoffMatches.length} partidas até ${cutoffLabel}.`}
        >
          <button type="button" className="filter-button" onClick={resetFilters}>Limpar filtros</button>
        </EmptyState>
      ) : (
        <>
          <div className="table-scroll" role="region" aria-label="Resultados por data; role para rolagem horizontal em telas pequenas" tabIndex={0}>
            <table className="results-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={ariaSort(column.id)}>
                      <button type="button" className="sort-button" onClick={() => toggleSort(column.id)}>
                        {column.header}
                        <span className="sort-indicator" aria-hidden="true">{ariaSort(column.id) === 'ascending' ? ' ↑' : ariaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((match) => (
                  <tr key={`${match.home}-${match.away}-${match.kickoff}`}>
                    <th scope="row" className="results-date">{formatKickoff(match.kickoff)}</th>
                    <td className="club-cell"><span className="results-club">{crestFor(match.home)}{nameFor.get(match.home) ?? match.home}</span></td>
                    <td className="numeric results-score"><ScoreLine homeGoals={match.homeGoals} awayGoals={match.awayGoals} /></td>
                    <td className="club-cell"><span className="results-club">{crestFor(match.away)}{nameFor.get(match.away) ?? match.away}</span></td>
                    <td><span className={`source-badge source-badge--${match.source}`}>{SOURCE_LABELS[match.source]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination" aria-label="Paginação dos resultados">
            <button type="button" className="filter-button" disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <span className="pagination-status" aria-live="polite">
              Página {currentPage + 1} de {pageCount} · {pageStart + 1}–{pageStart + visibleRows.length} de {sortedRows.length} linhas
            </span>
            <button type="button" className="filter-button" disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}>Próxima</button>
          </div>
        </>
      )}
    </section>
  )
}
