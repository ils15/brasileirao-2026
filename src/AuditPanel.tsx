import { useMemo, useState, type JSX } from 'react'
import { CURRENT_SEASON_SOURCE, currentSeasonResults } from './currentSeasonResults'
import { HISTORICAL_SOURCE, historicalSeasons } from './historicalSeasons'
import { currentClubs, remainingFixtures } from './projectionData'
import { validateHistoricalSeason } from './projection'
import { validateCurrentSeason } from './seasonStats'
import { filterAtOrBeforeAnalyticalCutoff, ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'
import { buildXlsx, downloadFile, toCSV, toJson, type ExportSheet } from './exporters'

interface DatasetDefinition {
  id: string
  title: string
  description: string
  filename: string
  build: () => ExportSheet
}

const datasets: DatasetDefinition[] = [
  {
    id: 'resultados',
    title: 'Resultados 2026 (log de partidas)',
    description: 'Todos os resultados até o corte, com fonte e referência original de cada linha.',
    filename: 'brasileirao-2026-resultados',
    build: () => ({
      name: 'Resultados 2026',
      columns: [
        { key: 'kickoff', header: 'Data/Hora' },
        { key: 'home', header: 'Mandante' },
        { key: 'away', header: 'Visitante' },
        { key: 'homeGoals', header: 'Gols Mandante' },
        { key: 'awayGoals', header: 'Gols Visitante' },
        { key: 'source', header: 'Fonte' },
        { key: 'sourceRef', header: 'Referência da Fonte' },
      ],
      rows: filterAtOrBeforeAnalyticalCutoff(currentSeasonResults).map((match) => ({
        kickoff: match.kickoff,
        home: match.home,
        away: match.away,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        source: match.source,
        sourceRef: match.sourceRef,
      })),
    }),
  },
  {
    id: 'calendario',
    title: `Calendário restante (${remainingFixtures.length} jogos)`,
    description: 'Jogos pendentes da tabela básica CBF, incluindo os oito adiados.',
    filename: 'brasileirao-2026-calendario-restante',
    build: () => ({
      name: 'Calendário restante',
      columns: [
        { key: 'round', header: 'Rodada' },
        { key: 'home', header: 'Mandante' },
        { key: 'away', header: 'Visitante' },
        { key: 'cbfRef', header: 'Referência CBF' },
      ],
      rows: remainingFixtures.map((fixture) => ({
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
        cbfRef: fixture.cbfRef,
      })),
    }),
  },
  {
    id: 'classificacao',
    title: 'Classificação oficial no corte (20 clubes)',
    description: 'Snapshot reconciliado com a tabela CBF em agregado.',
    filename: 'brasileirao-2026-classificacao',
    build: () => ({
      name: 'Classificação',
      columns: [
        { key: 'position', header: 'Posição' },
        { key: 'club', header: 'Clube' },
        { key: 'points', header: 'Pontos' },
        { key: 'played', header: 'Jogos' },
        { key: 'wins', header: 'Vitórias' },
        { key: 'draws', header: 'Empates' },
        { key: 'losses', header: 'Derrotas' },
        { key: 'goalsFor', header: 'Gols Pró' },
        { key: 'goalsAgainst', header: 'Gols Contra' },
      ],
      rows: currentClubs.map((club) => ({
        position: club.position,
        club: club.club,
        points: club.points,
        played: club.played,
        wins: club.wins,
        draws: club.draws,
        losses: club.losses,
        goalsFor: club.goalsFor,
        goalsAgainst: club.goalsAgainst,
      })),
    }),
  },
]

function provenanceBlock() {
  return {
    geradoEm: new Date().toISOString(),
    corteAnalitico: ANALYTICAL_CUTOFF_UTC,
    fontes: {
      footballData: { url: CURRENT_SEASON_SOURCE.footballData.url, sha256: CURRENT_SEASON_SOURCE.footballData.sha256, coletadoEm: CURRENT_SEASON_SOURCE.footballData.collectedAt },
      espn: { url: CURRENT_SEASON_SOURCE.espn.url, sha256: CURRENT_SEASON_SOURCE.espn.sha256, coletadoEm: CURRENT_SEASON_SOURCE.espn.collectedAt },
      cbf: { url: CURRENT_SEASON_SOURCE.cbfStandings.url, sha256: CURRENT_SEASON_SOURCE.cbfStandings.sha256, coletadoEm: CURRENT_SEASON_SOURCE.cbfStandings.collectedAt },
      historico: { url: HISTORICAL_SOURCE.url, sha256: HISTORICAL_SOURCE.sha256 },
    },
  }
}

function exportDataset(dataset: DatasetDefinition, format: 'csv' | 'xlsx' | 'json'): void {
  const sheet = dataset.build()
  if (format === 'csv') {
    downloadFile(`${dataset.filename}.csv`, 'text/csv;charset=utf-8', toCSV(sheet.columns, sheet.rows))
    return
  }
  if (format === 'xlsx') {
    downloadFile(`${dataset.filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buildXlsx([sheet]))
    return
  }
  downloadFile(`${dataset.filename}.json`, 'application/json;charset=utf-8', toJson({
    dataset: dataset.title,
    colunas: sheet.columns.map(({ header }) => header),
    ...provenanceBlock(),
    linhas: sheet.rows,
  }))
}

const VALIDATION_OK = 'ok'

interface ValidationRow {
  name: string
  scope: string
  result: string
  ok: boolean
}

function useValidations(): ValidationRow[] {
  return useMemo(() => {
    const current = validateCurrentSeason()
    return [
      {
        name: 'Temporada 2026',
        scope: `${current.clubs} clubes · ${current.completedMatches} jogos disputados · ${current.remainingMatches} pendentes`,
        result: current.mismatchedClubs === 0
          ? `${current.completedMatches + current.remainingMatches} jogos do calendário CBF reconciliados; estatísticas por mando fecham com o snapshot`
          : `${current.mismatchedClubs} clubes divergem entre resultados e snapshot`,
        ok: current.mismatchedClubs === 0,
      },
      ...historicalSeasons.map((season) => {
        const validation = validateHistoricalSeason(season)
        return {
          name: `Temporada ${season.year}`,
          scope: `${validation.clubs} clubes · ${validation.matches} jogos`,
          result: validation.mismatchedClubs === 0
            ? 'Totais oficiais conferem com os placares empacotados'
            : `${validation.mismatchedClubs} clubes divergem dos totais oficiais`,
          ok: validation.mismatchedClubs === 0,
        }
      }),
    ]
  }, [])
}

function SourceCard({ title, url, collectedAt, hash }: { title: string; url: string; collectedAt: string; hash: string }): JSX.Element {
  return (
    <div className="source-card">
      <h3>{title}</h3>
      <a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')} ↗</a>
      <dl>
        <div><dt>Coletado em</dt><dd>{collectedAt.replace('T', ' ')}</dd></div>
        <div><dt>SHA-256</dt><dd><code>{hash}</code></dd></div>
      </dl>
    </div>
  )
}

/**
 * Aba de conciliação e dados brutos: proveniência das fontes, status das
 * validações e exportação do log completo em CSV/XLSX/JSON.
 */
export function AuditPanel(): JSX.Element {
  const validations = useValidations()
  const [lastExport, setLastExport] = useState('')

  function handleExport(dataset: DatasetDefinition, format: 'csv' | 'xlsx' | 'json'): void {
    exportDataset(dataset, format)
    setLastExport(`${dataset.title} — ${format.toUpperCase()}`)
  }

  return (
    <section className="audit-section" id="dados" aria-labelledby="audit-title">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow-dark">CONCILIAÇÃO E PROCEDÊNCIA</p><h2 id="audit-title">Dados &amp; Auditoria</h2></div>
        <span className="section-index">04 <span>/ DADOS</span></span>
      </div>
      <p className="table-note">
        Snapshot estático com corte em 04/11/2026 13:00 BRT ({ANALYTICAL_CUTOFF_UTC}). Cada conjunto abaixo pode ser
        exportado com bloco de proveniência (fonte, SHA-256, corte e horário de geração).
      </p>

      <div className="audit-grid">
        <section className="panel audit-block" aria-labelledby="sources-title">
          <h3 id="sources-title">Fontes e captura</h3>
          <div className="source-cards">
            <SourceCard title="Football-Data (placares 2021–2026)" url={CURRENT_SEASON_SOURCE.footballData.url}
              collectedAt={CURRENT_SEASON_SOURCE.footballData.collectedAt} hash={CURRENT_SEASON_SOURCE.footballData.sha256} />
            <SourceCard title="ESPN (2 resultados ausentes no CSV)" url={CURRENT_SEASON_SOURCE.espn.url}
              collectedAt={CURRENT_SEASON_SOURCE.espn.collectedAt} hash={CURRENT_SEASON_SOURCE.espn.sha256} />
            <SourceCard title="CBF (classificação oficial)" url={CURRENT_SEASON_SOURCE.cbfStandings.url}
              collectedAt={CURRENT_SEASON_SOURCE.cbfStandings.collectedAt} hash={CURRENT_SEASON_SOURCE.cbfStandings.sha256} />
            <SourceCard title="Football-Data (histórico empacotado)" url={HISTORICAL_SOURCE.url}
              collectedAt={HISTORICAL_SOURCE.localFileMtime} hash={HISTORICAL_SOURCE.sha256} />
          </div>
          <p className="audit-note">
            CBF serve apenas à reconciliação agregada da tabela; placares individuais não foram conferidos jogo a jogo
            contra a fonte oficial. A artilharia (aba Visão Geral) é fonte secundária ESPN sem metadados de captura próprios.
          </p>
        </section>

        <section className="panel audit-block" aria-labelledby="validations-title">
          <h3 id="validations-title">Validações em execução</h3>
          <div className="table-scroll" role="region" aria-label="Status das validações de dados" tabIndex={0}>
            <table className="validations-table">
              <thead><tr><th scope="col">BASE</th><th scope="col">ESCOPO</th><th scope="col">RESULTADO</th><th scope="col"><span className="sr-only">Status</span></th></tr></thead>
              <tbody>
                {validations.map((validation) => (
                  <tr key={validation.name}>
                    <th scope="row">{validation.name}</th>
                    <td>{validation.scope}</td>
                    <td>{validation.result}</td>
                    <td className="numeric">
                      <span className={`validation-badge validation-badge--${validation.ok ? 'ok' : 'fail'}`}>
                        {validation.ok ? VALIDATION_OK : 'DIVERGE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel audit-block" aria-labelledby="exports-title">
          <h3 id="exports-title">Exportação de dados brutos</h3>
          <ul className="export-list">
            {datasets.map((dataset) => (
              <li key={dataset.id} className="export-item">
                <div>
                  <strong>{dataset.title}</strong>
                  <p>{dataset.description} <span className="export-rows">{dataset.build().rows.length} linhas</span></p>
                </div>
                <div className="export-buttons" role="group" aria-label={`Exportar ${dataset.title}`}>
                  <button type="button" className="filter-button" onClick={() => handleExport(dataset, 'csv')}>CSV</button>
                  <button type="button" className="filter-button" onClick={() => handleExport(dataset, 'xlsx')}>XLSX</button>
                  <button type="button" className="filter-button" onClick={() => handleExport(dataset, 'json')}>JSON</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="audit-note" aria-live="polite">
            {lastExport ? `Último download: ${lastExport}.` : 'Nenhum download gerado nesta visita; nada é enviado a servidores.'}
          </p>
        </section>
      </div>
    </section>
  )
}
