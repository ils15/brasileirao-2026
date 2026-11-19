# src/ — convenções de código

Aplicam-se a `src/**`; regras do projeto em `../AGENTS.md`.

## Modelos puros e determinísticos

- `matchModel.ts`, `eloModel.ts`, `projection.ts`, `pointCurve.ts`, `pointsDistribution.ts`, `modelBacktest.ts`, `rounds.ts`, `seasonStats.ts`, `discipline.ts` e `exporters.ts` expõem funções puras sobre os módulos de dados: sem I/O e sem estado global mutável.
- Aleatoriedade só com semente. Produção usa `SIMULATION_SEED` de `projectionConfig.ts` e o PRNG `createRandom(seed)` de `projection.ts`. `sampleMatchScore` recebe `uniform` injetado; `Math.random()` é apenas o default dessa injeção e não pode ser o caminho da projeção.
- Toda constante do modelo (simulações, semente, k, peso do blend xG, z do IC) mora em `projectionConfig.ts`. Não duplique números nem fórmulas — a auditoria já removeu cópias divergentes.
- Separe disputados de pendentes com `filterAtOrBeforeAnalyticalCutoff` (`sourceMetadata.ts`), nunca por data literal.

## Testes ao lado do código

- Cada módulo tem teste irmão: `matchModel.test.ts`, `projection.test.ts`, `pointCurve.test.ts`, `pointsDistribution.test.ts`, `modelBacktest.test.ts`, `rounds.test.ts`, `seasonStats.test.ts`, `discipline.test.ts`, `exporters.test.ts`.
- Componentes usam `*.test.tsx` com Testing Library: `App.test.tsx`, `Confrontos.test.tsx`, `ProjectionSection.test.tsx`, `StandingsViews.test.tsx`, `dadosComponents.test.tsx`, `FixtureCalendar.test.tsx`, `MatchSimulator.test.tsx`, `MethodologyPanel.test.tsx`, `HeadToHeadPanel.test.tsx`.
- Teste comportamento observável e determinismo (mesma semente → mesmo resultado). Reduza simulações nos testes (`runProjection({ simulations: 8, seed: 123 })`); 500.000 é para produção.
- Não crave corte, captura ou contagem do pacote: derive de `seasonFacts.ts`/`sourceMetadata.ts`. O sentinela `scripts/data-assertions.test.mjs` reprova literais voláteis.

## Performance

- O Monte Carlo roda no Web Worker (`projection.worker.ts`). Não importe `runProjection` em componente nem bloqueie a main thread; `ProjectionContext.tsx` é o único dono do worker e compartilha o resultado entre abas.
- Não dispare projeção no caminho de render: consuma o contexto. Backtests walk-forward são caros (cold start) e não pertencem a interação.
- `eloModel.ts` é independente do Poisson de gols; o valor dele é o desacoplamento no ensemble — não o acople ao modelo principal sem medir Brier.

## UI e acessibilidade

- Siga `docs/ui/conventions.md`: semântica (`section`, headings, `table` com `scope`), `role="tablist"`/`tabpanel`, foco visível, zona em `sr-only` e `aria-label` em barras e regiões roláveis.
- CSS centralizado em `styles.css`; sem Tailwind nem biblioteca de componentes. Texto e datas em pt-BR (`Intl.NumberFormat`).
- Mudança visível exige conferência em desktop e mobile; screenshot não substitui teste de comportamento.

## Dados gerados

- Não edite à mão `historicalSeasons.ts`, `currentSeasonResults.ts`, `projectionData.ts`, `sourceMetadata.ts`, `advancedStats2026.ts` ou `scorers2026.ts`: são saída do pipeline (ver `../scripts/AGENTS.md`).
