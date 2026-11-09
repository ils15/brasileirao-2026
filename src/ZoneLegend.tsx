import type { JSX, ReactNode } from 'react'
import { ZONES } from './projectionConfig'

type ZoneClassName = 'qualification' | 'sudamericana' | 'middle' | 'relegation'

interface ZoneLegendEntry {
  className: ZoneClassName
  label: string
  range: string
  detail: string
}

/** Detalhe da zona sem o parêntese explicativo, ex. "1º–6º*". */
function rangeOf(detail: string): string {
  return detail.split(' (')[0]
}

const ZONE_LEGEND_ENTRIES: ZoneLegendEntry[] = [
  { className: 'qualification', label: ZONES.libertadores.label, range: rangeOf(ZONES.libertadores.detail), detail: ZONES.libertadores.detail },
  { className: 'sudamericana', label: ZONES.sudamericana.label, range: rangeOf(ZONES.sudamericana.detail), detail: ZONES.sudamericana.detail },
  { className: 'middle', label: ZONES.middle.label, range: rangeOf(ZONES.middle.detail), detail: ZONES.middle.detail },
  { className: 'relegation', label: ZONES.relegation.label, range: rangeOf(ZONES.relegation.detail), detail: ZONES.relegation.detail },
]

interface ZoneLegendProps {
  ariaLabel?: string
  describedBy?: string
  note?: ReactNode
}

/**
 * Legenda única de zonas: um chip por faixa da tabela. Fica acima da
 * classificação para evitar repetir o mesmo texto em cada linha de clube.
 */
export function ZoneLegend({
  ariaLabel = 'Legenda de zonas da classificação',
  describedBy,
  note,
}: ZoneLegendProps): JSX.Element {
  return (
    <div className="zone-legend" role="group" aria-label={ariaLabel} aria-describedby={describedBy}>
      {ZONE_LEGEND_ENTRIES.map((entry) => (
        <span key={entry.className} className={`zone-chip zone-chip--${entry.className}`} title={entry.detail}>
          {entry.label} · {entry.range}
        </span>
      ))}
      {note}
    </div>
  )
}
