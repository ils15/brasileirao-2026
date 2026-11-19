import type { JSX } from 'react'
import { NextRoundPanel } from './NextRoundPanel'
import { ResultsTable } from './ResultsTable'
import { FixtureCalendar } from './FixtureCalendar'
import { TeamAnalysisPanel } from './TeamAnalysisPanel'
import { HeadToHeadPanel } from './HeadToHeadPanel'

/** Aba Jogos & Confrontos — carregada sob demanda (React.lazy). */
export function JogosTab(): JSX.Element {
  return (
    <>
      <NextRoundPanel />
      <ResultsTable />
      <FixtureCalendar />
      <TeamAnalysisPanel />
      <HeadToHeadPanel />
    </>
  )
}
