# scripts/ — pipeline de dados

Aplicam-se a `scripts/**`; regras do projeto em `../AGENTS.md`.

## Mapa

- `update-data.mjs` orquestra a coleta pós-rodada: Football-Data + ESPN (e secundárias), concilia com o calendário CBF, regenera módulos, roda a suíte e commita. `--dry-run` coleta e mostra o diff sem escrever.
- `lib/dataPipeline.mjs` concentra parsers e validações puras; `lib/threesixfive.mjs` (xG/cartões), `lib/espnMatchEvents.mjs` (gols/cartões por partida da ESPN) e `lib/apifutebolbr.mjs` (descontinuado) têm parsers por fonte.
- `pack-history.mjs` empacota 2003–2025 em `src/historicalSeasons.ts`; `crosscheck-wikipedia.mjs` grava `reports/crosscheck-2003-2011.md` e `reports/conflicts.json`; `check-pages-build.mjs` é o `npm run smoke:pages`.
- `backfill-xg-cards.mjs` e `refresh-espn-scorers.mjs` rodam isolados ou por chamada do updater (`refresh-apifutebolbr.mjs` está descontinuado e não é chamado); `install-hooks.mjs` instala `.githooks`; `check-deploy-freshness.mjs` é alerta de CI (sempre sai com 0) e `check-data-freshness.mjs` (com `lib/freshness.mjs`) é o alarme agendado de defasagem, que reprova o run.

## Regras

- **Nunca fabrique dado.** Sem rede ou sem chave (ex.: `API_FUTEBOL_BR_KEY`), use os snapshots versionados; modo offline/`--dry-run` deve produzir o mesmo pacote, senão a reprodução mente.
- **Preserve procedência.** Todo dado coletado vira snapshot bruto + SHA-256 no módulo gerado. Não “conserte” placar sem fonte nem reescreva snapshot para bater com o resultado.
- **Crosscheck obrigatório ao mexer em histórico.** Divergência com a Wikipédia nunca é resolvida por maioria, recência ou votação: a camada canônica segue OpenFootball e o conflito fica aberto em `reports/conflicts.json`.
- **Falhe alto.** `validateIntegrity`/`validateAdvancedStats` abortam com calendário CBF quebrado, par (casa, fora) duplicado, xG fora da tolerância ou tabela divergente demais. Não adicione fallback silencioso.
- **ESM puro, sem dependência nova** (Node 24, igual ao CI). Se precisar de biblioteca, justifique; prefira a stdlib.
- **Não commite saída parcial**: snapshot truncado, módulo gerado pela metade ou `reports/` incompleto. O updater commita apenas os caminhos de dados listados em `docs/infra/conventions.md` §2.
- **Sem literais voláteis em teste**: corte, captura e contagens derivam dos módulos. `data-assertions.test.mjs` reprova o contrário; o opt-out `// data-fixa: <motivo>` vale só para fixture sintética.

## Contrato de saída

- Módulos gerados carregam cabeçalho com fonte e SHA-256 (e data de geração/captura quando aplicável) — preserve o formato ao renderizar.
- `docs/atualizacoes.md` é log público por execução; uma entrada só é escrita quando há resultado novo conciliável.
- Relatórios do crosscheck são determinísticos (sem timestamp volátil); não introduza ruído de execução.

## Verificação

- Rode o teste irmão do que mudou: `npx vitest run scripts/lib/dataPipeline.test.mjs`, `npx vitest run scripts/pack-history.test.mjs`, `npx vitest run scripts/crosscheck-wikipedia.test.mjs` (ou `scripts/lib/threesixfive.test.mjs`, `scripts/lib/apifutebolbr.test.mjs`, `scripts/install-hooks.test.mjs`).
- Depois rode o script afetado em `--dry-run` quando existir e confira o diff antes de reportar.
- `npm test` completo só no gate final; o pre-commit também o executa.
