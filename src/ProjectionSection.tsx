import { useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { SIMULATION_COUNT, SIMULATION_SEED } from './projectionConfig'
import type { ClubProbability, ProjectionResult } from './projection'
import type { PointCurveAggregateRow } from './pointCurve'
import { useProjection, type ProjectionStatus } from './ProjectionContext'
import { Crest } from './Crest'
import { GamepadIcon } from './icons'
import { seasonFacts, cutoffLabel } from './seasonFacts'
import { useTableSort, type SortableColumn } from './useTableSort'
import { buildXlsx, downloadFile, toCSV, toJson } from './exporters'
import { MatchSimulator } from './MatchSimulator'

interface ProjectionPanelProps {
  result: ProjectionResult | null
  status: ProjectionStatus
  onRetry: () => void
}

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })

/**
 * Texto do IC 95% na tabela por pontuação. Só faixas de 1 ponto exibem IC: em
 * faixas com 2+ pontos o intervalo varia por pontuação e um envelope
 * (min/max de membros distintos) não corresponde a nenhum ponto do range.
 * Mesmo em faixa de 1 ponto, o texto é omitido quando idêntico ao da faixa
 * anterior.
 */
function intervalTextFor(lower: number, upper: number): string {
  return `IC 95% ${percent.format(lower)}–${percent.format(upper)}`
}

type MagicKey = MagicDestiny | 'middle'
const MAGIC_KEYS: MagicKey[] = ['title', 'libertadores', 'sudamericana', 'middle', 'relegation']

interface MagicRow {
  points: number
  probabilities: Record<MagicKey, number>
  intervals: Record<MagicKey, [number, number]>
  lowSample: Record<MagicKey, boolean>
  /**
   * Indica se a projeção registrou ao menos um sucesso do destino naquela
   * pontuação (`successes > 0`). `false` significa zero sucessos do destino
   * naquelas simulações, não ausência de simulações: `denominator` segue
   * sendo o número de observações da pontuação. Nesse caso a probabilidade 0
   * e o intervalo [0, 1] são apenas valores neutros, sem IC legítimo.
   */
  observed: Record<MagicKey, boolean>
  inclusiveLibertadores: PointCurveAggregateRow
  denominator: number
}

/** Faixa contígua de pontuações que exibem o mesmo valor formatado. */
interface MagicRowGroup {
  from: number
  to: number
  row: MagicRow
  lowSample: boolean
  /**
   * Menor e maior número de simulações entre os pontos da faixa. Em faixas
   * sem observação o N varia por pontuação e é anunciado como intervalo; um
   * único N inventado seria falso.
   */
  sampleMin: number
  sampleMax: number
}

/** `true` quando a faixa cobre mais de uma pontuação e, portanto, não exibe IC. */
function showsRangeOf(group: MagicRowGroup): boolean {
  return group.from !== group.to
}

const MAGIC_COLORS: Record<MagicDestiny | 'middle', string> = {
  title: '#1f6d3d',
  libertadores: '#78a957',
  sudamericana: '#4c5870',
  middle: '#b8c1ba',
  relegation: '#d47a63',
}

function emptyMagicRow(points: number): MagicRow {
  return {
    points,
    probabilities: { title: 0, libertadores: 0, sudamericana: 0, middle: 0, relegation: 0 },
    intervals: {
      title: [0, 1], libertadores: [0, 1], sudamericana: [0, 1], middle: [0, 1], relegation: [0, 1],
    },
    lowSample: { title: false, libertadores: false, sudamericana: false, middle: false, relegation: false },
    observed: { title: false, libertadores: false, sudamericana: false, middle: false, relegation: false },
    inclusiveLibertadores: {
      points, successes: 0, denominator: 0, probability: 0, lower95: 0, upper95: 1, clusterCount: 0, lowSample: false,
    },
    denominator: 0,
  }
}

/** Curva P(destino | pontos) em SVG: destino selecionado em destaque, demais em fundo. */
function MagicCurveChart({ rows, destiny }: { rows: MagicRow[]; destiny: MagicDestiny }): JSX.Element {
  const width = 640
  const height = 320
  const padding = { top: 16, right: 16, bottom: 30, left: 42 }
  const points = rows.map((row) => row.points)
  const minX = Math.min(...points)
  const maxX = Math.max(...points)
  const xAt = (value: number): number =>
    padding.left + ((value - minX) / Math.max(1, maxX - minX)) * (width - padding.left - padding.right)
  const yAt = (probability: number): number =>
    height - padding.bottom - probability * (height - padding.top - padding.bottom)

  // A chance inclusiva de Libertadores (1º–6º*) vem do agregado por simulação.
  const probabilityFor = (row: MagicRow, destinyId: MagicKey): number => {
    if (destinyId === 'libertadores') return row.inclusiveLibertadores.probability
    return row.probabilities[destinyId]
  }
  const pathFor = (destinyId: MagicKey): string =>
    rows.map((row, index) => `${index === 0 ? 'M' : 'L'}${xAt(row.points).toFixed(1)},${yAt(probabilityFor(row, destinyId)).toFixed(1)}`).join(' ')

  const xTicks = [minX, 30, 40, 50, 60, 70, maxX].filter((value, index, list) => list.indexOf(value) === index)

  return (
    <svg
      className="magic-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Curva de probabilidade de cada destino dado o total de pontos; ${MAGIC_DESTINIES.find((entry) => entry.id === destiny)!.label} destacado`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((probability) => (
        <g key={probability}>
          <line x1={padding.left} x2={width - padding.right} y1={yAt(probability)} y2={yAt(probability)} className="magic-grid" />
          <text x={padding.left - 6} y={yAt(probability) + 4} textAnchor="end" className="magic-tick">{Math.round(probability * 100)}%</text>
        </g>
      ))}
      <line x1={padding.left} x2={width - padding.right} y1={yAt(0.5)} y2={yAt(0.5)} className="magic-halfway" />
      {xTicks.map((value) => (
        <text key={value} x={xAt(value)} y={height - padding.bottom + 18} textAnchor="middle" className="magic-tick">{value}</text>
      ))}
      {MAGIC_KEYS.filter((key) => key !== destiny).map((key) => (
        <path key={key} d={pathFor(key)} className="magic-curve" stroke={MAGIC_COLORS[key]} />
      ))}
      {rows.length > 1 && (
        <>
          <path d={`${pathFor(destiny)} L${xAt(maxX).toFixed(1)},${yAt(0)} L${xAt(minX).toFixed(1)},${yAt(0)} Z`} fill={MAGIC_COLORS[destiny]} opacity={0.14} stroke="none" />
          <path d={pathFor(destiny)} className="magic-curve is-active" stroke={MAGIC_COLORS[destiny]} />
        </>
      )}
    </svg>
  )
}

const MAGIC_DESTINIES = [
  { id: 'relegation', label: 'Série B', phrase: 'rebaixado para a Série B', absence: 'nenhum rebaixamento', swatch: 'zone-bar--relegation' },
  { id: 'libertadores', label: 'Libertadores', phrase: 'classificado para a Libertadores', absence: 'nenhuma vaga na Libertadores', swatch: 'zone-bar--libertadores' },
  { id: 'sudamericana', label: 'Sul-Americana', phrase: 'classificado para a Sul-Americana', absence: 'nenhuma na Sul-Americana', swatch: 'zone-bar--sudamericana' },
  { id: 'title', label: 'Campeão', phrase: 'campeão', absence: 'nenhum título', swatch: 'zone-bar--title' },
] as const

type MagicDestiny = (typeof MAGIC_DESTINIES)[number]['id']

/**
 * Curva P(destino | pontuação exata) em formato "linha do destino": o usuário
 * escolhe o destino e TODA a leitura (gráfico, KPIs, tabela) responde a ele —
 * exibindo somente a estatística da classe selecionada.
 */
function MagicPointsPanel({ result }: { result: ProjectionResult }): JSX.Element {
  const [destiny, setDestiny] = useState<MagicDestiny>('relegation')
  const rows = useMemo<MagicRow[]>(() => {
    const byPoints = new Map<number, MagicRow>()
    for (const row of result.pointCurve.rows) {
      const entry = byPoints.get(row.points) ?? emptyMagicRow(row.points)
      entry.probabilities[row.outcome] = row.probability
      entry.intervals[row.outcome] = [row.lower95, row.upper95]
      entry.lowSample[row.outcome] = row.lowSample
      entry.observed[row.outcome] = row.successes > 0
      entry.denominator = row.denominator
      byPoints.set(row.points, entry)
    }
    for (const row of result.pointCurve.inclusiveLibertadores) {
      const entry = byPoints.get(row.points) ?? emptyMagicRow(row.points)
      entry.inclusiveLibertadores = row
      byPoints.set(row.points, entry)
    }
    return [...byPoints.values()].sort((left, right) => left.points - right.points)
  }, [result])

  const destinyEntry = MAGIC_DESTINIES.find((entry) => entry.id === destiny)!
  const destinyPhrase = destinyEntry.phrase
  const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
  // Libertadores é chance inclusiva de vaga (1º–6º*); Sul-Americana fica
  // exclusiva (7º–12º), assim como título (1º) e as demais faixas.
  const chanceOf = (row: MagicRow, destinyOverride?: MagicKey): number => {
    const key = destinyOverride ?? destiny
    if (key === 'libertadores') return row.inclusiveLibertadores.probability
    return row.probabilities[key]
  }
  const intervalFor = (row: MagicRow): [number, number] => {
    if (destiny === 'libertadores') return [row.inclusiveLibertadores.lower95, row.inclusiveLibertadores.upper95]
    return row.intervals[destiny]
  }
  const lowSampleFor = (row: MagicRow): boolean => {
    if (destiny === 'libertadores') return row.inclusiveLibertadores.lowSample
    return row.lowSample[destiny]
  }
  /**
   * Uma linha só tem estimativa quando houve ao menos uma observação do
   * destino naquela pontuação. `observed` é `successes > 0`; Libertadores usa
   * o agregado inclusivo (1º–6º), que existe para todo ponto com simulações e
   * pode ter zero sucessos — por isso não usa o denominador.
   */
  const hasObservationsFor = (row: MagicRow): boolean => {
    if (destiny === 'libertadores') return row.inclusiveLibertadores.successes > 0
    return row.observed[destiny]
  }
  /** Simulações da pontuação para o destino atual (Libertadores usa o agregado inclusivo). */
  const denominatorFor = (row: MagicRow): number => {
    if (destiny === 'libertadores') return row.inclusiveLibertadores.denominator
    return row.denominator
  }

  // Para rebaixamento a pergunta é invertida: quantos pontos para ESCAPAR.
  // effectiveChance representa a chance do "bom resultado" (salvo / destino conquistado).
  const escaping = destiny === 'relegation'

  /**
   * Início da tabela: no rebaixamento a leitura começa na primeira pontuação
   * cuja barra já é cheia (100,00%). Pontuações menores com barra incompleta
   * não aparecem, porque não acrescentam informação ao bloco garantido. Nas
   * demais abas a curva não começa garantida e todas as pontuações ficam.
   */
  const displayRows = useMemo(() => {
    if (!escaping) return rows
    const fullText = percent.format(1)
    const firstFull = rows.findIndex((row) => hasObservationsFor(row) && percent.format(chanceOf(row)) === fullText)
    if (firstFull <= 0) return rows
    return rows.slice(firstFull)
  }, [rows, escaping, destiny])

  /**
   * Agrupa faixas contíguas cujo valor exibido é idêntico. O critério é o
   * texto formatado (duas casas), nunca a igualdade estatística: pontuações
   * que mostram o mesmo percentual viram uma única linha de intervalo, com um
   * único valor. O IC não é agregado: quando a faixa tem 2+ pontos ele varia
   * por pontuação e por isso não é exibido. Pontuações sem nenhum sucesso do
   * destino formam um bloco próprio, independentemente do N: o N varia por
   * pontuação e é anunciado como intervalo. O bloco de zero também atravessa
   * pontuações sem simulações (que não geram linha), porque nenhuma delas
   * contradiz a ausência; faixas de valor observado, ao contrário, exigem
   * pontos numericamente adjacentes.
   */
  const compactRows = useMemo<MagicRowGroup[]>(() => {
    const displayKeyOf = (row: MagicRow): string => hasObservationsFor(row)
      ? `valor:${percent.format(chanceOf(row))}`
      : 'sem-observação'
    const groups: MagicRowGroup[] = []
    for (const row of displayRows) {
      const last = groups[groups.length - 1]
      const sameKey = last !== undefined && displayKeyOf(last.row) === displayKeyOf(row)
      // Faixa de valor exibido exige adjacência numérica; bloco sem observação
      // agrupa linhas consecutivas mesmo quando falta um total de pontos (sem
      // simulações, não há linha para contradizer a ausência).
      const merges = sameKey && (!hasObservationsFor(row) || last!.to + 1 === row.points)
      if (merges) {
        const group = last!
        group.to = row.points
        group.lowSample = group.lowSample || lowSampleFor(row)
        group.sampleMin = Math.min(group.sampleMin, denominatorFor(row))
        group.sampleMax = Math.max(group.sampleMax, denominatorFor(row))
      } else {
        const sample = denominatorFor(row)
        groups.push({
          from: row.points,
          to: row.points,
          row,
          lowSample: lowSampleFor(row),
          sampleMin: sample,
          sampleMax: sample,
        })
      }
    }
    return groups
  }, [displayRows, destiny])
  // Sinaliza ao usuário quando a tabela do rebaixamento foi truncada abaixo
  // do primeiro 100,00%.
  const truncatedBelowFull = escaping && displayRows.length < rows.length
  const effectiveChanceOf = (row: MagicRow): number => (escaping ? 1 - chanceOf(row) : chanceOf(row))
  const likely = rows.find((row) => effectiveChanceOf(row) >= 0.5)
  const nearCertain = rows.find((row) => effectiveChanceOf(row) >= 0.9)

  // Limite da faixa inicial onde o destino é praticamente garantido (só faz
  // sentido quando começa garantido — ex. rebaixamento em pontuações baixas).
  const guaranteedEnd = useMemo(() => {
    if (!escaping) return undefined
    let end: number | undefined
    for (const row of rows) {
      if (chanceOf(row) >= 0.9) end = row.points
      else break
    }
    return end
  }, [rows, escaping])
  const guaranteedMinSafety = useMemo(() => {
    if (guaranteedEnd === undefined) return undefined
    const inBand = rows.filter((row) => row.points <= guaranteedEnd!)
    return Math.min(...inBand.map((row) => 1 - chanceOf(row)))
  }, [rows, guaranteedEnd])

  // Primeira pontuação em que o destino começa a aparecer.
  const firstChanceRow = useMemo(() => rows.find((row) => chanceOf(row) > 0), [rows])

  // Zona cinzenta: entre "praticamente descartado" e "praticamente garantido".
  const grayZone = useMemo(() => {
    const inZone = rows.filter((row) => effectiveChanceOf(row) > 0.1 && effectiveChanceOf(row) < 0.9)
    if (inZone.length === 0) return undefined
    return {
      from: inZone[0]!.points,
      to: inZone[inZone.length - 1]!.points,
      safetyMin: Math.min(...inZone.map((row) => effectiveChanceOf(row))),
      safetyMax: Math.max(...inZone.map((row) => effectiveChanceOf(row))),
    }
  }, [rows, escaping])

  return (
    <section className="point-curve-section magic-points" aria-labelledby="magic-points-title">
      <h4 className="points-table-title" id="magic-points-title">A pontuação mágica: quantos pontos bastam?</h4>
      <p className="projection-table-note">
        Escolha o destino e veja somente a estatística dele dado um total de pontos exato, entre as mesmas {integer.format(result.simulations)} simulações.
        IC 95% cluster-robusto por simulação; faixas contíguas de pontuações com o mesmo valor exibido aparecem como um intervalo (ex.: 21–37), com um único percentual e sem IC, porque o intervalo varia por pontuação. Pontuações contíguas sem nenhuma observação do destino também formam uma única faixa, mesmo com N diferente, e atravessam totais de pontos sem simulações (que não geram linha); um ponto com observação intercalado quebra o bloco.
      </p>
      <div className="magic-destiny-picker" role="group" aria-label="Destino para a pontuação mágica">
        {MAGIC_DESTINIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={destiny === entry.id ? 'evolution-chip is-selected' : 'evolution-chip'}
            aria-pressed={destiny === entry.id}
            onClick={() => setDestiny(entry.id)}
          >
            <i className={`zone-bar-swatch ${entry.swatch}`} aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </div>

      <div className="magic-layout">
        <div className="magic-chart-box">
          <MagicCurveChart rows={rows} destiny={destiny} />
          <p className="magic-chart-caption">
            Linha tracejada: 50% — acima dela, ser {destinyPhrase} é o resultado mais provável.
            {destiny === 'libertadores' && <> Libertadores conta como <strong>vaga (1º–6º*)</strong>, incluindo o campeão: a curva sobe até 100%.</>}
            {destiny === 'sudamericana' && <> Sul-Americana é a faixa exclusiva de <strong>7º–12º</strong>; não inclui título nem vaga de Libertadores.</>}
          </p>
        </div>
        <div className="magic-kpis" aria-label={`Linhas do destino para ${destinyPhrase}`}>
          {likely && (
            <div className="kpi-card">
              <strong className="kpi-value">{likely.points}<span className="kpi-divider"> pts</span></strong>
              <span className="kpi-label">
                {escaping
                  ? `Sem Série B é o mais provável (${percent.format(1 - chanceOf(likely))})`
                  : destiny === 'sudamericana'
                  ? `Faixa Sul-Americana (7º–12º: ${percent.format(chanceOf(likely))})`
                  : `${cap(destinyPhrase)} é o mais provável (${percent.format(chanceOf(likely))})`}
              </span>
            </div>
          )}
          {nearCertain && (
            <div className="kpi-card">
              <strong className="kpi-value">{nearCertain.points}<span className="kpi-divider"> pts</span></strong>
              <span className="kpi-label">
                {escaping
                  ? `Sem Série B praticamente garantido (${percent.format(chanceOf(nearCertain))} restante)`
                  : `Praticamente garantido (${percent.format(chanceOf(nearCertain))})`}
              </span>
            </div>
          )}
          {escaping && guaranteedEnd !== undefined && (
            <div className="kpi-card">
              <strong className="kpi-value">Até {guaranteedEnd}<span className="kpi-divider"> pts</span></strong>
              <span className="kpi-label">{cap(destinyPhrase)} praticamente garantido (escapar ≤ {percent.format(1 - guaranteedMinSafety!)})</span>
            </div>
          )}
          {!escaping && firstChanceRow && chanceOf(firstChanceRow) < 0.1 && (
            <div className="kpi-card">
              <strong className="kpi-value">{firstChanceRow.points}<span className="kpi-divider"> pts</span></strong>
              <span className="kpi-label">Chance começa a aparecer aqui ({percent.format(chanceOf(firstChanceRow))})</span>
            </div>
          )}
          {grayZone && (
            <div className="kpi-card">
              <strong className="kpi-value">{grayZone.from}–{grayZone.to}<span className="kpi-divider"> pts</span></strong>
              <span className="kpi-label">
                {escaping
                  ? `Zona cinzenta: segurança ${percent.format(grayZone.safetyMin)}–${percent.format(grayZone.safetyMax)}`
                  : `Zona cinzenta: chance ${percent.format(grayZone.safetyMin)}–${percent.format(grayZone.safetyMax)}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="table-scroll" role="region" aria-label={`Chance de ser ${destinyPhrase} por pontuação exata; faixas contíguas de mesmo valor aparecem como intervalo com um único percentual; o IC 95% é omitido em faixas com mais de um ponto; pontos contíguos sem observação do destino aparecem como uma única faixa sem percentual${truncatedBelowFull ? '; a tabela começa na primeira pontuação com 100,00% de rebaixamento e valores menores não são exibidos' : ''}`} tabIndex={0}>
        <table className="projection-table magic-table">
          <thead><tr>
            <th scope="col">Pontos</th>
            <th scope="col" className="numeric">Chance de ser {destinyPhrase}</th>
            <th scope="col">IC 95% e barra</th>
          </tr></thead>
          <tbody>
            {compactRows.map((group, index) => {
              const row = group.row
              const hasObservations = hasObservationsFor(row)
              const chance = chanceOf(row)
              const previousGroup = index > 0 ? compactRows[index - 1] : undefined
              const showsRange = showsRangeOf(group)
              const chanceText = percent.format(chance)
              const pointsLabel = showsRange ? `De ${group.from} a ${group.to} pontos` : `Com ${group.from} pontos`
              // Faixa de 1 ponto: IC normal, omitido só quando repete o da
              // faixa anterior de 1 ponto. Faixa com 2+ pontos: sem IC, pois
              // ele varia entre as pontuações do range.
              const intervalText = showsRange ? null : intervalTextFor(...intervalFor(row))
              const previousIntervalText = previousGroup && !showsRangeOf(previousGroup) && hasObservationsFor(previousGroup.row)
                ? intervalTextFor(...intervalFor(previousGroup.row))
                : null
              const showsIntervalText = Boolean(hasObservations && intervalText && intervalText !== previousIntervalText)
              // Sem observação: o N varia por pontuação, então o nome acessível
              // cita o intervalo de simulações em vez de inventar um N único.
              const singlePoint = group.from === group.to
              const sampleLabel = group.sampleMax <= 0
                ? null
                : group.sampleMin === group.sampleMax
                  ? singlePoint
                    ? `${integer.format(group.sampleMax)} simulações desta pontuação`
                    : `${integer.format(group.sampleMax)} simulações nesta faixa`
                  : `de ${integer.format(group.sampleMin)} a ${integer.format(group.sampleMax)} simulações por pontuação`
              const accessibleName = !hasObservations
                ? `${pointsLabel}: ${destinyEntry.absence} nas simulações${sampleLabel ? `; ${sampleLabel}` : ''}`
                : showsRange
                  ? `${pointsLabel}: ${chanceText} de ${destinyPhrase}; intervalo de confiança não exibido porque pode variar entre os pontos${group.lowSample ? '; amostra baixa' : ''}`
                  : `${pointsLabel}: ${chanceText} de ${destinyPhrase}; ${intervalText}${group.lowSample ? '; amostra baixa' : ''}`
              return (
                <tr key={group.from}>
                  <th scope="row" className="magic-points-cell">{showsRange ? `${group.from}–${group.to}` : group.from}</th>
                  <td className="numeric games-cell magic-active-value">
                    {!hasObservations
                      ? <span className="magic-empty" aria-hidden="true">{destinyEntry.absence}</span>
                      : <span aria-hidden="true">{chanceText}</span>}
                  </td>
                  <td className="magic-bar-cell">
                    <div
                      className={hasObservations ? 'magic-bar' : 'magic-bar magic-bar--empty'}
                      role="img"
                      aria-label={accessibleName}
                    >
                      {hasObservations && <span className="magic-bar-fill" style={{ width: `${chance * 100}%` }} aria-hidden="true" />}
                      {hasObservations && group.lowSample && <span className="magic-bar-low" aria-hidden="true">amostra baixa</span>}
                    </div>
                    {showsIntervalText && <span className="cell-ci" aria-hidden="true">{intervalText}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="projection-table-note">
        Faixas agrupam pontos com o mesmo valor exibido; o percentual aparece uma vez por faixa.
        O IC 95% é omitido em faixas com mais de um ponto, porque o intervalo varia entre os pontos e um envelope não representaria nenhum deles; nas faixas de um ponto, o IC só se repete quando difere da faixa anterior.
        Valores apenas parecidos não são agrupados: o critério é o texto formatado idêntico, nunca a igualdade estatística.
        Faixas sem nenhuma observação do destino mostram “nenhum rebaixamento” (ou “nenhum título”, “nenhuma vaga na Libertadores”, “nenhuma na Sul-Americana”), com barra vazia e sem IC; elas agrupam pontos consecutivos independentemente do N e atravessam totais de pontos sem simulações, e o total de simulações é anunciado como intervalo quando varia. Pontuações com 0,00% arredondado, mas com ao menos um sucesso observado, continuam como linha própria com percentual e IC.
        {truncatedBelowFull && ' A tabela começa na primeira pontuação com 100,00% de rebaixamento; valores menores não são exibidos.'}
      </p>
    </section>
  )
}

const zoneColumns: SortableColumn<ClubProbability>[] = [
  { id: 'position', header: 'Pos', accessor: ({ currentPosition }) => currentPosition, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'title', header: 'Título', accessor: ({ title }) => title, numeric: true },
  { id: 'libertadores', header: 'Libertadores', accessor: ({ libertadores }) => libertadores, numeric: true },
  { id: 'sudamericana', header: 'Sul-Americana', accessor: ({ sudamericana }) => sudamericana, numeric: true },
  { id: 'relegation', header: 'Rebaixamento', accessor: ({ relegation }) => relegation, numeric: true },
]

const pointsColumns: SortableColumn<ClubProbability>[] = [
  { id: 'position', header: 'Pos', accessor: ({ currentPosition }) => currentPosition, numeric: true },
  { id: 'club', header: 'Clube', accessor: ({ club }) => club, numeric: false },
  { id: 'currentPoints', header: 'Hoje', accessor: ({ currentPoints }) => currentPoints, numeric: true },
  { id: 'median', header: 'Mediana', accessor: ({ pointsStats }) => pointsStats.median, numeric: true },
  { id: 'p25', header: 'Faixa típica (P25)', accessor: ({ pointsStats }) => pointsStats.p25, numeric: true },
  { id: 'p75', header: 'Faixa típica (P75)', accessor: ({ pointsStats }) => pointsStats.p75, numeric: true },
  { id: 'p90', header: 'Cenário alto (P90)', accessor: ({ pointsStats }) => pointsStats.p90, numeric: true },
  { id: 'delta', header: 'Δ vs hoje', accessor: ({ pointsStats, currentPoints }) => pointsStats.median - currentPoints, numeric: true },
]

interface ProbabilityCellProps {
  value: number
  lower: number
  upper: number
  kind?: 'title' | 'libertadores' | 'sudamericana' | 'relegation'
}

function ProbabilityCell({ value, lower, upper, kind }: ProbabilityCellProps): JSX.Element {
  const hasInterval = value > 0 && value < 1
  const pct = value * 100
  const heatClass = value === 0 ? 'probability-cell--zero' : kind ? `probability-cell--${kind}` : ''
  return (
    <td className={`numeric probability-cell ${heatClass}`}>
      <div className="prob-cell-content">
        <strong>{percent.format(value)}</strong>
        {hasInterval && <span className="cell-ci">IC {percent.format(lower)}–{percent.format(upper)}</span>}
      </div>
      {value > 0.01 && (
        <div className="prob-mini-track" aria-hidden="true">
          <div className={`prob-mini-bar prob-mini-bar--${kind ?? 'default'}`} style={{ width: `${Math.min(100, Math.max(4, pct))}%` }} />
        </div>
      )}
    </td>
  )
}

const ZONE_BAR_SEGMENTS = [
  { key: 'title', className: 'zone-bar--title', label: 'Campeão' },
  { key: 'libertadores', className: 'zone-bar--libertadores', label: 'Libertadores 2º–6º' },
  { key: 'sudamericana', className: 'zone-bar--sudamericana', label: 'Sul-Americana' },
  { key: 'middle', className: 'zone-bar--middle', label: 'Meio de tabela' },
  { key: 'relegation', className: 'zone-bar--relegation', label: 'Rebaixamento' },
] as const

interface ClubForBar extends ClubProbability {}

/** Barra 100% com as cinco zonas possíveis do clube — leitura instantânea do cenário. */
function ZoneStackedBar({ club }: { club: ClubForBar }): JSX.Element {
  // A coluna geral de Libertadores é inclusiva (1º–6º); na barra, o campeão
  // fica separado e a faixa Libertadores representa somente 2º–6º.
  const libertadoresExclusive = Math.max(0, club.libertadores - club.title)
  const middle = Math.max(0, 1 - club.title - libertadoresExclusive - club.sudamericana - club.relegation)
  const values: Record<(typeof ZONE_BAR_SEGMENTS)[number]['key'], number> = {
    title: club.title,
    libertadores: libertadoresExclusive,
    sudamericana: club.sudamericana,
    middle,
    relegation: club.relegation,
  }
  const ariaLabel = ZONE_BAR_SEGMENTS.map((segment) => `${segment.label} ${percent.format(values[segment.key])}`).join(', ')
  return (
    <div className="zone-bar" role="img" aria-label={`Cenários de ${club.club}: ${ariaLabel}`}>
      {ZONE_BAR_SEGMENTS.map((segment) => (
        <span key={segment.key} className={`zone-bar-segment ${segment.className}`} style={{ width: `${values[segment.key] * 100}%` }} />
      ))}
    </div>
  )
}

function ZoneBarLegend(): JSX.Element {
  return (
    <div className="zone-bar-legend" role="group" aria-label="Legenda das barras de zonas">
      {ZONE_BAR_SEGMENTS.map((segment) => (
        <span key={segment.key}><i className={`zone-bar-swatch ${segment.className}`} aria-hidden="true" />{segment.label}</span>
      ))}
    </div>
  )
}

function exportProjections(result: ProjectionResult, format: 'csv' | 'xlsx' | 'json'): void {
  const columns = [
    { key: 'position', header: 'Posição Atual' },
    { key: 'club', header: 'Clube' },
    { key: 'currentPoints', header: 'Pontos no Corte' },
    { key: 'title', header: 'Título (%)' },
    { key: 'titleLow', header: 'Título IC 95% Inferior (%)' },
    { key: 'titleHigh', header: 'Título IC 95% Superior (%)' },
    { key: 'libertadores', header: 'Libertadores (%)' },
    { key: 'sudamericana', header: 'Sul-Americana (%)' },
    { key: 'relegation', header: 'Rebaixamento (%)' },
    { key: 'median', header: 'Mediana de Pontos Finais' },
    { key: 'mean', header: 'Média de Pontos Finais' },
    { key: 'p25', header: 'P25 de Pontos Finais' },
    { key: 'p75', header: 'P75 de Pontos Finais' },
    { key: 'p90', header: 'P90 de Pontos Finais' },
    { key: 'stdDev', header: 'Desvio-Padrão de Pontos Finais' },
  ]
  const rows = result.clubProbabilities.map((club) => ({
    position: club.currentPosition,
    club: club.club,
    currentPoints: club.currentPoints,
    title: club.title * 100,
    titleLow: club.titleInterval.lower95 * 100,
    titleHigh: club.titleInterval.upper95 * 100,
    libertadores: club.libertadores * 100,
    sudamericana: club.sudamericana * 100,
    relegation: club.relegation * 100,
    median: club.pointsStats.median,
    mean: Number(club.pointsStats.mean.toFixed(2)),
    p25: club.pointsStats.p25,
    p75: club.pointsStats.p75,
    p90: club.pointsStats.p90,
    stdDev: Number(club.pointsStats.stdDev.toFixed(2)),
  }))
  const filename = `brasileirao-2026-projecoes-n${integer.format(result.simulations)}`
  if (format === 'csv') {
    downloadFile(`${filename}.csv`, 'text/csv;charset=utf-8', toCSV(columns, rows))
    return
  }
  if (format === 'xlsx') {
    downloadFile(`${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buildXlsx([{ name: 'Projeções por clube', columns, rows }]))
    return
  }
  downloadFile(`${filename}.json`, 'application/json;charset=utf-8', toJson({
    dataset: 'Projeções Monte Carlo por clube',
    simulacoes: result.simulations,
    semente: result.seed,
    corteAnalitico: seasonFacts.cutoffLocal,
    colunas: columns.map(({ header }) => header),
    linhas: rows,
  }))
}

function ProjectionPanel({ result, status, onRetry }: ProjectionPanelProps): JSX.Element {
  const [activeAnalysis, setActiveAnalysis] = useState<'por-clube' | 'por-pontuacao' | 'simulador'>('por-clube')
  const analysisTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const probabilityRows = useMemo(() => result?.clubProbabilities ?? [], [result])
  const { sortedRows: sortedZones, sortColumnId: zoneSortColumnId, direction: zoneDirection, toggleSort: toggleZoneSort, resetSort: resetZoneSort, ariaSort: zoneAriaSort } = useTableSort(probabilityRows, zoneColumns, 'position')
  const { sortedRows: sortedPoints, sortColumnId: pointsSortColumnId, direction: pointsDirection, toggleSort: togglePointsSort, resetSort: resetPointsSort, ariaSort: pointsAriaSort } = useTableSort(probabilityRows, pointsColumns, 'position')
  const isCustomZoneSort = zoneSortColumnId !== 'position' || zoneDirection !== 'ascending'
  const isCustomPointsSort = pointsSortColumnId !== 'position' || pointsDirection !== 'ascending'

  function handleAnalysisTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const views = ['por-clube', 'por-pontuacao', 'simulador'] as const
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % views.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + views.length) % views.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : -1
    if (nextIndex < 0) return
    event.preventDefault()
    setActiveAnalysis(views[nextIndex]!)
    analysisTabRefs.current[nextIndex]?.focus()
  }

  return (
    <section className="projection-section" id="projecoes" aria-labelledby="projection-title">
      <div className="projection-heading">
        <div>
          <p className="eyebrow eyebrow-dark">CENÁRIOS ESTATÍSTICOS</p>
          <h2 id="projection-title">O que ainda pode acontecer</h2>
          <p className="projection-lead">Estimativas para o encerramento da Série A, condicionadas à tabela reconstruída para o corte analítico e aos jogos restantes da tabela básica CBF.</p>
        </div>
        <span className="section-index">03 <span>/ PROJEÇÕES</span></span>
      </div>

      <div className="projection-meta" aria-label="Parâmetros da projeção">
        <span><strong>{integer.format(SIMULATION_COUNT)}</strong> simulações</span>
        <span><strong>{seasonFacts.remainingCount}</strong> jogos restantes</span>
        <span><strong>{cutoffLabel}</strong> corte analítico</span>
        <span><strong>{result?.seed ?? SIMULATION_SEED}</strong> semente fixa</span>
      </div>

      <p className="projection-disclaimer">
        Não são odds nem recomendação de apostas. A dispersão de Monte Carlo mede apenas a variação da simulação com este modelo; não representa toda a incerteza dos dados ou da metodologia.
      </p>
      <p className="projection-table-note"><strong>G-6*:</strong> cenário adotado neste painel; a vaga ao 6º não é conclusão automática apenas porque o Palmeiras chegou à final da Copa do Brasil.</p>
      <p className="projection-table-note"><strong>Regulamento:</strong> o <a href="https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf" target="_blank" rel="noreferrer">REC CBF 2026 (Art. 7)</a> aloca à Sul-Americana os seis clubes seguintes que não estejam na Libertadores (7º–12º neste cenário). A redistribuição depende das regras aplicáveis e da sobreposição de classificados; títulos e vagas de copas não são simulados.</p>

      {status === 'loading' && <p className="projection-status" role="status">Calculando cenários em segundo plano…</p>}
      {status === 'ready' && <p className="sr-only" role="status">Projeção concluída: probabilidades e distribuições para {integer.format(result?.simulations ?? SIMULATION_COUNT)} simulações disponíveis.</p>}
      {status === 'error' && (
        <div className="projection-status projection-error" role="alert">
          <p>Não foi possível executar as simulações neste navegador. Nenhum percentual foi substituído por estimativa manual.</p>
          <button className="filter-button" type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      )}

      <div className="subtabs" role="tablist" aria-label="Análises da projeção">
        <button
          className={activeAnalysis === 'por-clube' ? 'subtab is-selected' : 'subtab'}
          id="aba-por-clube" role="tab" type="button"
          aria-selected={activeAnalysis === 'por-clube'} aria-controls="analise-por-clube"
          tabIndex={activeAnalysis === 'por-clube' ? 0 : -1}
          ref={(element) => { analysisTabRefs.current[0] = element }}
          onClick={() => setActiveAnalysis('por-clube')}
          onKeyDown={(event) => handleAnalysisTabKeyDown(event, 0)}
        >Por clube</button>
        <button
          className={activeAnalysis === 'por-pontuacao' ? 'subtab is-selected' : 'subtab'}
          id="aba-por-pontuacao" role="tab" type="button"
          aria-selected={activeAnalysis === 'por-pontuacao'} aria-controls="analise-por-pontuacao"
          tabIndex={activeAnalysis === 'por-pontuacao' ? 0 : -1}
          ref={(element) => { analysisTabRefs.current[1] = element }}
          onClick={() => setActiveAnalysis('por-pontuacao')}
          onKeyDown={(event) => handleAnalysisTabKeyDown(event, 1)}
        >Por pontuação</button>
        <button
          className={activeAnalysis === 'simulador' ? 'subtab is-selected' : 'subtab'}
          id="aba-simulador" role="tab" type="button"
          aria-selected={activeAnalysis === 'simulador'} aria-controls="analise-simulador"
          tabIndex={activeAnalysis === 'simulador' ? 0 : -1}
          ref={(element) => { analysisTabRefs.current[2] = element }}
          onClick={() => setActiveAnalysis('simulador')}
          onKeyDown={(event) => handleAnalysisTabKeyDown(event, 2)}
        ><GamepadIcon className="inline-icon" /> Simulador Interativo</button>
      </div>

      {!result && (
        <div className="projection-pending-areas">
          <section className="projection-block projection-placeholder" id="probabilidades-time" aria-labelledby="pending-clubs-title">
            <h3 id="pending-clubs-title">Probabilidades por time</h3>
            <p>{status === 'loading' ? 'Esta análise ficará disponível quando as simulações forem concluídas.' : 'Esta análise não está disponível porque as simulações falharam.'}</p>
          </section>
          <section className="projection-block projection-placeholder" id="por-pontuacao" aria-labelledby="pending-points-title">
            <h3 id="pending-points-title">Probabilidade por pontuação</h3>
            <p>{status === 'loading' ? 'As distribuições e curvas exatas aparecerão após a conclusão das simulações.' : 'As distribuições e curvas não estão disponíveis porque as simulações falharam.'}</p>
          </section>
        </div>
      )}

      {result && (
        <>
          <div role="tabpanel" id="analise-por-clube" aria-labelledby="aba-por-clube" hidden={activeAnalysis !== 'por-clube'}>
          <section className="projection-block" id="probabilidades-time" aria-labelledby="club-probabilities-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">PROJEÇÕES POR CLUBE</p><h3 id="club-probabilities-title">Vagas, permanência e pontos finais</h3></div>
              <span>n = {integer.format(result.simulations)} simulações · IC 95% Wilson</span>
            </div>
            <div className="how-to-read">
              <strong>Como ler:</strong>
              <ul>
                <li><strong>Em que zona o clube pode terminar?</strong> — a barra colorida mostra as cinco zonas possíveis em cada simulação; os percentuais dão a chance de cada uma.</li>
                <li><strong>Quantos pontos o clube deve fazer?</strong> — a mediana é o valor central das simulações; a faixa típica reúne metade central (P25–P75) e o P90 um cenário alto.</li>
                <li>Cada chance vem com o intervalo de confiança de 95% (IC) — a incerteza da própria estimativa com n = {integer.format(result.simulations)}.</li>
              </ul>
            </div>

            <div className="table-header-flex">
              <h4 className="points-table-title" id="zones-table-title">Em que zona cada clube pode terminar?</h4>
              {isCustomZoneSort && (
                <button type="button" className="reset-sort-btn" onClick={resetZoneSort} title="Restaurar ordenação pela classificação oficial">
                  ↺ Restaurar ordem oficial
                </button>
              )}
            </div>
            <ZoneBarLegend />
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Zonas possíveis por clube nas simulações; role para rolagem horizontal em telas pequenas" tabIndex={0}>
              <table className="projection-table zones-table">
                <thead>
                  <tr>
                    {zoneColumns.map((column) => (
                      <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={zoneAriaSort(column.id)}>
                        <button type="button" className="sort-button" onClick={() => toggleZoneSort(column.id)}>
                          {column.id === 'libertadores' ? 'LIBERTADORES¹' : column.header}
                          <span className="sort-indicator" aria-hidden="true">{zoneAriaSort(column.id) === 'ascending' ? ' ↑' : zoneAriaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedZones.map((club, index) => (
                    <tr key={club.id}>
                      <th scope="row">
                        <span className="projection-current-position">{String(index + 1).padStart(2, '0')}</span>
                        <Crest clubId={club.id} />
                        <span>{club.club}</span>
                        {isCustomZoneSort && (
                          <span className="official-pos-badge" title={`Posição oficial no corte: ${club.currentPosition}º`}>
                            {club.currentPosition}º oficial
                          </span>
                        )}
                      </th>
                      <td className="zone-bar-cell"><ZoneStackedBar club={club} /></td>
                      <ProbabilityCell kind="title" value={club.title} lower={club.titleInterval.lower95} upper={club.titleInterval.upper95} />
                      <ProbabilityCell kind="libertadores" value={club.libertadores} lower={club.libertadoresInterval.lower95} upper={club.libertadoresInterval.upper95} />
                      <ProbabilityCell kind="sudamericana" value={club.sudamericana} lower={club.sudamericanaInterval.lower95} upper={club.sudamericanaInterval.upper95} />
                      <ProbabilityCell kind="relegation" value={club.relegation} lower={club.relegationInterval.lower95} upper={club.relegationInterval.upper95} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="projection-footnote">¹ Considera as posições 1–6* na tabela (1º–4º direto; 5º preliminar); consulte acima a premissa do asterisco. ² Posições 7–12: seis melhores não classificados à Libertadores, somente pela tabela do Brasileirão. As chances são condicionais a este recorte.</p>

            <div className="table-header-flex">
              <h4 className="points-table-title" id="points-final-title">Quantos pontos cada clube deve fazer?</h4>
              {isCustomPointsSort && (
                <button type="button" className="reset-sort-btn" onClick={resetPointsSort} title="Restaurar ordenação pela classificação oficial">
                  ↺ Restaurar ordem oficial
                </button>
              )}
            </div>
            <div className="table-scroll projection-table-scroll" role="region" aria-label="Pontos finais projetados por clube; role para rolagem horizontal em telas pequenas" tabIndex={0}>
              <table className="projection-table points-final-table">
                <thead>
                  <tr>
                    {pointsColumns.map((column) => (
                      <th key={column.id} scope="col" className={column.numeric ? 'numeric sortable' : 'sortable'} aria-sort={pointsAriaSort(column.id)}>
                        <button type="button" className="sort-button" onClick={() => togglePointsSort(column.id)}>
                          {column.header}
                          <span className="sort-indicator" aria-hidden="true">{pointsAriaSort(column.id) === 'ascending' ? ' ↑' : pointsAriaSort(column.id) === 'descending' ? ' ↓' : ' ↕'}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPoints.map((club, index) => {
                    const delta = club.pointsStats.median - club.currentPoints
                    const deltaPercent = club.currentPoints === 0 ? 0 : delta / club.currentPoints
                    return (
                      <tr key={club.id}>
                        <td className="numeric position-cell">{String(index + 1).padStart(2, '0')}</td>
                        <th scope="row" className="club-cell">
                          <Crest clubId={club.id} />
                          <span>{club.club}</span>
                          {isCustomPointsSort && (
                            <span className="official-pos-badge" title={`Posição oficial no corte: ${club.currentPosition}º`}>
                              {club.currentPosition}º oficial
                            </span>
                          )}
                        </th>
                        <td className="numeric games-cell">{club.currentPoints}</td>
                        <td className="numeric probability-cell"><strong>{club.pointsStats.median}</strong><span className="cell-ci">média {decimal.format(club.pointsStats.mean)}</span></td>
                        <td className="numeric range-cell">{club.pointsStats.p25}</td>
                        <td className="numeric range-cell">{club.pointsStats.p75}</td>
                        <td className="numeric games-cell">{club.pointsStats.p90}<span className="cell-ci">mínimo {club.pointsStats.min}</span></td>
                        <td className="numeric">
                          <span className={`delta-badge ${delta > 0 ? 'delta-badge--up' : delta < 0 ? 'delta-badge--down' : 'delta-badge--flat'}`}>
                            {signedDecimal.format(delta)} pts ({signedDecimal.format(deltaPercent * 100)}%)
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="projection-table-note">Mediana e percentis usam a definição nearest-rank sobre as {integer.format(result.simulations)} simulações; Δ compara a mediana projetada com os pontos no corte (valor absoluto e percentual).</p>

            <div className="export-row" role="group" aria-label="Exportar projeções por clube">
              <span className="export-row-label">Baixar as duas tabelas:</span>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'csv')}>CSV</button>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'xlsx')}>XLSX</button>
              <button type="button" className="filter-button" onClick={() => exportProjections(result, 'json')}>JSON</button>
            </div>
          </section>
          </div>

          <div role="tabpanel" id="analise-por-pontuacao" aria-labelledby="aba-por-pontuacao" hidden={activeAnalysis !== 'por-pontuacao'}>
          <section className="projection-block" id="por-pontuacao" aria-labelledby="points-analysis-title">
            <div className="projection-block-heading">
              <div><p className="eyebrow eyebrow-dark">Probabilidade por pontuação</p><h3 id="points-analysis-title">Quantos pontos levam a quê</h3></div>
              <span>Pontuações inteiras observadas nas mesmas {integer.format(result.simulations)} simulações.</span>
            </div>

            <MagicPointsPanel result={result} />
          </section>
          </div>

          <div role="tabpanel" id="analise-simulador" aria-labelledby="aba-simulador" hidden={activeAnalysis !== 'simulador'}>
            <MatchSimulator result={result} />
          </div>
        </>
      )}
    </section>
  )
}

export function ProjectionSection(): JSX.Element {
  const { result, status, retry } = useProjection()
  return <ProjectionPanel result={result} status={status} onRetry={retry} />
}

export { ProjectionPanel }
