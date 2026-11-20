import type { JSX } from 'react'
import { StandingsViews } from './StandingsViews'
import { useProjection } from './ProjectionContext'
import { resolveLibertadoresZones } from './projectionConfig'

/**
 * Aba Classificações & Análises — carregada sob demanda (React.lazy).
 * As zonas da classificação acompanham o cenário ativo; sem resultado ainda,
 * valem as zonas do cenário (default G-6).
 */
export function ClassificacoesTab(): JSX.Element {
  const { result, scenario } = useProjection()
  const zones = result?.libertadoresZones ?? resolveLibertadoresZones(scenario)
  return <StandingsViews zones={zones} />
}
