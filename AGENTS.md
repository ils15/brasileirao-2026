# AGENTS.md — brasileirao-2026

Regras globais do usuário têm precedência; este arquivo cobre apenas o projeto.

## Propósito e arquitetura

Painel analítico e preditivo da Série A 2026 (React 19 + TypeScript `strict` + Vite): 100% client-side, sem backend, banco ou chamada de API em runtime. Os dados chegam prontos em módulos TS versionados, gerados pelo pipeline de `scripts/` a partir de snapshots brutos em `data/source-snapshots/`. O cálculo pesado — 500.000 simulações Monte Carlo (`SIMULATION_COUNT` em `src/projectionConfig.ts`) — roda em Web Worker (`src/projection.worker.ts`) através de um único `ProjectionProvider`; a main thread não simula.

Documentação canônica: `docs/metodologia.md` (fórmulas e constantes), `docs/auditoria-calculos.md` (decisões e correções), `docs/dicionario-dados.md` (nomenclatura), `docs/infra/conventions.md` (pipeline) e `docs/ui/conventions.md` (UI). Se código e doc divergirem, o código vence — corrija o doc no mesmo commit.

## Layout

```
src/                    # React + TS: modelos, dados versionados, worker e testes ao lado do código
scripts/                # pipeline ESM (.mjs): coleta, conciliação, empacotamento e crosscheck; parsers puros em scripts/lib/
data/source-snapshots/  # snapshots brutos (Football-Data, ESPN diário, CBF, OpenFootball, 365scores)
data/corroboration/     # sidecar Wikipédia (CC BY-SA 4.0) para o crosscheck
docs/                   # metodologia, auditoria, dicionário, atualizações e convenções
reports/                # saída gerada do crosscheck
.github/workflows/      # pages.yml (CI/deploy) e update-data.yml (cron pós-rodada)
.githooks/              # pre-commit e commit-msg
```

## Comandos

Todos existem em `package.json`, exceto o instalador de hooks (script avulso citado no README).

| Comando | Quando usar |
|---|---|
| `npm run dev` | desenvolvimento local com Vite em `http://localhost:5173/` |
| `npm run build` | `tsc -b && vite build`; valide o build antes de entregar |
| `npm test` | suíte completa Vitest — gate final/CI, nunca em loop de edição |
| `npm run test:watch` | Vitest em watch enquanto edita |
| `npm run smoke:pages` | valida o build do Pages: rebuilda com `GITHUB_PAGES=true` e confere assets + worker sob `/brasileirao-2026/` |
| `npm run pack:history` | reconstrói `src/historicalSeasons.ts` a partir dos snapshots |
| `npm run crosscheck` | cruza 2003–2011 com a Wikipédia e grava `reports/` |
| `npm run update:data` | coleta pós-rodada: escreve módulos de dados, snapshots e `docs/atualizacoes.md`, roda a suíte e commita |
| `node scripts/install-hooks.mjs` | instala `.githooks` (o pre-commit roda `npm test` e o build do Pages) |

`node scripts/update-data.mjs --dry-run` inspeciona a coleta sem escrever.

## Slicing de testes (crítico)

Os testes ficam ao lado do código: `src/<modulo>.test.ts` / `.test.tsx` e `scripts/**/<modulo>.test.mjs`.

- Em loop, rode **somente** o arquivo correspondente: `npx vitest run src/matchModel.test.ts`, `npx vitest run scripts/lib/dataPipeline.test.mjs`.
- É proibido rodar `npm test` completo a cada edição: a suíte paga o cold start dos backtests walk-forward (timeout de 30s em `vite.config.ts`) e destrói o ciclo de feedback.
- A suíte completa é gate final (handoff/commit) e do CI, não um passo de desenvolvimento.
- Valide antes de commitar; não contorne o hook com `--no-verify`.

## Invariantes de dados

- **Snapshots estáticos versionados**: nada é buscado em runtime. O updater copia as cópias brutas para `data/source-snapshots/` e registra SHA-256 nos módulos gerados (`src/currentSeasonResults.ts`, `src/advancedStats2026.ts`, `src/scorers2026.ts`).
- **Corte analítico**: `ANALYTICAL_CUTOFF_UTC`/`_LOCAL` em `src/sourceMetadata.ts` define o que entra. Use `filterAtOrBeforeAnalyticalCutoff`/`isAtOrBeforeAnalyticalCutoff`; nunca compare datas à mão. Football-Data não declara fuso (o dia-limite inteiro fica fora); ESPN usa o instante explícito do kickoff.
- **Calendário e conciliação**: `src/cbfOfficialSchedule.ts` tem 380 tuplas com par ordenado (casa, fora) único; `disputados + pendentes = 380`. Divergência de classificação acima de 2 clubes contra a ESPN aborta a publicação (`validateIntegrity` em `scripts/lib/dataPipeline.mjs`).
- **Fronteira histórica**: 2003–2011 (OpenFootball, CC0, 3.857 partidas) é apenas descritivo/H2H; 2012–2025 (Football-Data, 5.319 partidas) alimenta modelo, calibração e backtest. `modelableHistoricalSeasons` em `src/historicalSeasons.ts` mantém o corte em 2012.
- **Backtest**: walk-forward por temporada/rodada com Brier H/E/F (`src/modelBacktest.ts`); o protocolo está em `docs/metodologia.md` e na aba Metodologia. Não avalie o modelo em dados que ele já viu.

## Arquivos gerados — não editar à mão

| Arquivo | Gerado por |
|---|---|
| `src/historicalSeasons.ts` | `npm run pack:history` |
| `src/currentSeasonResults.ts`, `src/projectionData.ts`, `src/sourceMetadata.ts`, `docs/atualizacoes.md`, `data/source-snapshots/` | `npm run update:data` |
| `src/advancedStats2026.ts`, `src/scorers2026.ts` | `scripts/backfill-xg-cards.mjs` e `scripts/refresh-espn-scorers.mjs` (chamados pelo updater) |
| `reports/crosscheck-2003-2011.md`, `reports/conflicts.json` | `npm run crosscheck` |

## Build de Pages

O site é servido em `/brasileirao-2026/` (`base` condicionado a `GITHUB_PAGES` em `vite.config.ts`). Para reproduzir a publicação:

```bash
GITHUB_PAGES=true npm run build && npm run smoke:pages
```

`smoke:pages` falha se um asset ou o `projection.worker-*.js` não resolver sob o base path — o build de Pages nunca deve ser validado só pelo `build`.

## Gates antes de considerar pronto

1. `npx vitest run <arquivo>.test.ts` do que mudou durante o loop.
2. Suíte completa uma vez no fim (`npm test`), incluindo o sentinela `scripts/data-assertions.test.mjs`, que reprova corte, captura ou contagem do pacote cravados em teste.
3. `GITHUB_PAGES=true npm run build && npm run smoke:pages`.
4. Se mexeu em dados ou pipeline, siga o checklist de `docs/infra/conventions.md` §7.
5. `git diff --cached --check` limpo — o pre-commit também exige.

## Trabalho paralelo

- Uma worktree por task (`git worktree add`); nunca dois agentes no mesmo checkout.
- Ownership por caminho: não edite arquivo sob responsabilidade de outro agente sem combinar; merge sequencial, rebase apenas local.
- Nunca `git push --force` nem `git reset --hard` sem aprovação humana explícita.
