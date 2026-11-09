import { useMemo, useState, type JSX } from 'react'
import { CURRENT_SEASON_PACK_GENERATED_AT, CURRENT_SEASON_SOURCE, currentSeasonResults } from './currentSeasonResults'
import { ADVANCED_STATS_SOURCE, advancedMatches } from './advancedStats2026'
import { HISTORICAL_SOURCE, OPENFOOTBALL_SOURCE, historicalSeasons } from './historicalSeasons'
import { currentClubs, remainingFixtures } from './projectionData'
import { validateHistoricalSeason } from './projection'
import { validateCurrentSeason } from './seasonStats'
import { filterAtOrBeforeAnalyticalCutoff, ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'
import { cutoffLabel, scorersCaptureLabel } from './seasonFacts'
import { SCORERS_SOURCE } from './data'
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
    title: 'Classificação derivada do pacote (20 clubes)',
    description: 'Agregados reconciliados internamente; a cópia CBF arquivada soma 332 jogos e não valida o pacote atual.',
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
      openFootball: historicalSeasons.flatMap((season) => season.provenance ? [{ year: season.year, ...season.provenance }] : []),
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
  status: 'ok' | 'fail' | 'unverified'
}

function useValidations(): ValidationRow[] {
  return useMemo<ValidationRow[]>(() => {
    const current = validateCurrentSeason()
    const currentRow: ValidationRow = {
      name: 'Temporada 2026',
      scope: `${current.clubs} clubes · ${current.completedMatches} jogos disputados · ${current.remainingMatches} pendentes`,
      result: current.mismatchedClubs === 0
        ? `${current.completedMatches + current.remainingMatches} jogos do calendário CBF reconciliados; estatísticas por mando fecham com o snapshot`
        : `${current.mismatchedClubs} clubes divergem entre resultados e snapshot`,
      status: current.mismatchedClubs === 0 ? 'ok' : 'fail',
    }
    return [
      currentRow,
      ...historicalSeasons.map((season) => {
        const validation = validateHistoricalSeason(season)
        const integrity: ValidationRow = {
          name: `Temporada ${season.year} — integridade estrutural`,
          scope: `${validation.clubs} clubes · ${validation.matches} placares`,
          result: validation.structuralValid
            ? 'IDs, datas, placares, ordinais e identidade de fixture válidos'
            : `${validation.structuralIssues} problemas estruturais encontrados`,
          status: validation.structuralValid ? 'ok' : 'fail',
        }
        const sample: ValidationRow = {
          name: `Temporada ${season.year} — validação amostral RSSSF`,
          scope: season.provenance ? '1 confronto comparado' : 'Sem amostra independente registrada',
          result: validation.sampleVerified
            ? `Data, clubes e placar da amostra conferem (https://www.rsssfbrasil.com/tablesae/br${season.year}.htm)`
            : 'Sem validação amostral independente registrada',
          status: validation.sampleVerified ? 'ok' : 'unverified',
        }
        const standings: ValidationRow = {
          name: `Temporada ${season.year} — tabela final independente`,
          scope: `${validation.clubs} clubes · ${validation.matches} placares`,
          result: validation.standingsVerified
            ? validation.mismatchedClubs === 0
              ? 'Tabela final verificada confere com os placares empacotados'
              : `${validation.mismatchedClubs} clubes divergem da tabela final verificada`
            : 'Tabela final independente não verificada; nenhum total oficial é declarado',
          status: !validation.standingsVerified ? 'unverified' : validation.mismatchedClubs === 0 ? 'ok' : 'fail',
        }
        return [integrity, sample, standings]
      }),
    ].flat()
  }, [])
}

interface SourceCardProps {
  title: string
  url: string
  timestamp: string
  hash: string
  timestampLabel?: string
  hashLabel?: string
  note?: string
}

function SourceCard({
  title,
  url,
  timestamp,
  hash,
  timestampLabel = 'Captura da fonte',
  hashLabel = 'SHA-256',
  note,
}: SourceCardProps): JSX.Element {
  return (
    <div className="source-card">
      <h4>{title}</h4>
      <a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')} ↗</a>
      <dl>
        <div><dt>{timestampLabel}</dt><dd>{timestamp.replace('T', ' ').replace(/Z$/, ' UTC')}</dd></div>
        <div><dt>{hashLabel}</dt><dd><code>{hash}</code></dd></div>
      </dl>
      {note ? <p className="source-card-note">{note}</p> : null}
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
  const currentScoreKeys = new Set(currentSeasonResults.map((match) => `${match.home}|${match.away}|${match.homeGoals}-${match.awayGoals}`))
  const matchingAdvancedScoreCount = advancedMatches.filter((match) =>
    currentScoreKeys.has(`${match.home}|${match.away}|${match.homeScore}-${match.awayScore}`),
  ).length

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
        Corte analítico: {cutoffLabel} ({ANALYTICAL_CUTOFF_UTC}). Pacote gerado em {CURRENT_SEASON_PACK_GENERATED_AT}. Captura individual de Football-Data, ESPN e CBF: não registrada no snapshot.
         Cada conjunto abaixo pode ser exportado com bloco de proveniência (fonte, SHA-256, corte e horário de geração).
      </p>

      <div className="audit-grid">
        <section className="panel audit-block" aria-labelledby="sources-title">
          <h3 id="sources-title">Fontes e captura</h3>
          <div className="source-cards">
            <SourceCard title="Football-Data (placares 2021–2026)" url={CURRENT_SEASON_SOURCE.footballData.url}
              timestamp={CURRENT_SEASON_SOURCE.footballData.collectedAt} hash={CURRENT_SEASON_SOURCE.footballData.sha256} />
            <SourceCard title={`ESPN (${CURRENT_SEASON_SOURCE.espn.withoutFootballDataScore} de ${CURRENT_SEASON_SOURCE.espn.completedMatches} resultados atribuídos à ESPN no pacote sem correspondência no CSV Football-Data)`} url={CURRENT_SEASON_SOURCE.espn.url}
              timestamp={CURRENT_SEASON_SOURCE.espn.collectedAt} hash={CURRENT_SEASON_SOURCE.espn.sha256} />
            <SourceCard title="CBF (HTML de classificação arquivado)" url={CURRENT_SEASON_SOURCE.cbfStandings.url}
              timestamp={CURRENT_SEASON_SOURCE.cbfStandings.collectedAt} hash={CURRENT_SEASON_SOURCE.cbfStandings.sha256}
              note="Exibe 04/11/2026 - 19:41 (fuso e significado não declarados); soma 332 jogos. A captura individual não foi registrada e o arquivo não valida o pacote nem placares individuais." />
            <SourceCard title="Football-Data (histórico empacotado)" url={HISTORICAL_SOURCE.url}
              timestamp={HISTORICAL_SOURCE.localFileMtime} timestampLabel="mtime do arquivo" hash={HISTORICAL_SOURCE.sha256}
              note="Última modificação local; não comprova captura ou coleta." />
            <div className="source-card">
              <h4>OpenFootball (histórico descritivo 2003–2011 · CC0 1.0)</h4>
              <a href={`${OPENFOOTBALL_SOURCE.repository}/tree/${OPENFOOTBALL_SOURCE.commit}`} target="_blank" rel="noreferrer">{OPENFOOTBALL_SOURCE.repository.replace(/^https?:\/\//, '')} ↗</a>
              <dl><div><dt>Commit fixado</dt><dd><code>{OPENFOOTBALL_SOURCE.commit}</code></dd></div><div><dt>Licença</dt><dd>CC0 1.0 · <code>{OPENFOOTBALL_SOURCE.licenseFile}</code></dd></div></dl>
              <details><summary>Proveniência dos nove snapshots</summary><ul className="source-snapshot-list">
                {historicalSeasons.filter((season) => season.provenance).map((season) => <li key={season.year}>{season.year}: <a href={season.provenance!.url} target="_blank" rel="noreferrer">arquivo OpenFootball</a> · blob <code>{season.provenance!.blobSha}</code></li>)}
              </ul></details>
            </div>
            <SourceCard title="365scores (xG e cartões)" url="https://webws.365scores.com/web/games/results/?appvid=365&competitions=113&showOdds=false"
              timestamp={ADVANCED_STATS_SOURCE.fetchedAt} timestampLabel="Obtido em" hash={ADVANCED_STATS_SOURCE.sha256}
              hashLabel="SHA-256 do JSON canônico" />
          </div>
          <p className="audit-note">
            RSSSF valida uma partida amostral por temporada, não tabelas finais de 2003–2011. 2004: RSSSF lista Figueirense com 45 jogos na tabela, mas a lista de resultados e OpenFootball somam 46; a dedução de 24 pontos do São Caetano não é apresentada como tabela oficial no app. 2005: Brasiliense–Vasco em 24/04 é 2–2 no placar jogado OpenFootball; RSSSF registra 0–1 administrativo, sem substituir o placar da fonte. Os 11 pares de replay de 2005 permanecem como partidas distintas.
          </p>
          <p className="audit-note">
            A cópia CBF arquivada soma 332 jogos e não valida este pacote; placares individuais não foram conferidos jogo a jogo
            contra a fonte oficial. Correspondência de placares 365scores ↔ pacote: {matchingAdvancedScoreCount}/{advancedMatches.length}; isso não comprova cobertura temporal por partida. O snapshot 365scores foi obtido em {ADVANCED_STATS_SOURCE.fetchedAt} (posterior ao corte e à geração do pacote); sem timestamps por partida, dados pós-corte não são garantidos como parte do corte analítico. Artilharia: {SCORERS_SOURCE.name}, captura {scorersCaptureLabel}, posterior ao corte; sem timestamp por partida, cobertura temporal não verificada.
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
                       <span className={`validation-badge validation-badge--${validation.status}`}>
                         {validation.status === 'ok' ? VALIDATION_OK : validation.status === 'fail' ? 'DIVERGE' : 'NÃO VERIFICADO'}
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
