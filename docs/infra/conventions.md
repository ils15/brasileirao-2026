# Convenções de infraestrutura e pipeline

Contrato operacional do pacote de dados e da publicação. Se algo aqui divergir do
código, o código vence: corrija este arquivo no mesmo commit.

## 1. Fluxo de dados

```
fontes                          updater                     derivados versionados
─────────────────────────────   ────────────────────────    ─────────────────────────────
Football-Data CSV (BR.csv)  ─┐                              src/currentSeasonResults.ts
ESPN scoreboard (1 por dia) ─┼─► scripts/update-data.mjs ──► src/projectionData.ts
CBF calendário (380 jogos)  ─┘        │                     src/sourceMetadata.ts
                                      ├─► data/source-snapshots/   (cópias brutas + SHA-256)
                                      └─► docs/atualizacoes.md     (log público por execução)
                                                    │
                                                    ▼
                                     npm run build (Vite, dist/ estático) ──► GitHub Pages
```

- `scripts/update-data.mjs` coleta, concilia, valida, regenera os módulos TS, roda a
  suíte e **commita** o pacote. Ele não faz push nem deploy: isso é do workflow.
- Fontes secundárias (`scripts/backfill-xg-cards.mjs` → 365scores,
  `scripts/refresh-espn-scorers.mjs` → eventos de partida da ESPN para a artilharia)
  rodam só quando o plano de coleta pede, e falham de forma branda (mantêm snapshot
  anterior). `scripts/refresh-apifutebolbr.mjs` está **descontinuado** (trial encerrado,
  HTTP 429 permanente) e não é mais chamado pelo updater.
- Artilharia: um snapshot normalizado por partida em
  `data/source-snapshots/espn-events-<eventId>.json`; o módulo `src/scorers2026.ts` é
  agregado desses snapshots (nunca da rede direto) e declara cobertura. Cartões do ESPN
  servem só de corroboração em log — a fonte de xG/cartões do produto continua a 365scores.
- Classificação, projeções Monte Carlo e análises são derivadas **no cliente**, em
  runtime, a partir dos módulos versionados. Nada de número pré-calculado em build.
- Sem rede (`--dry-run` ou ausência de `FETCH`), o updater lê os snapshots locais:
  o modo offline precisa produzir o mesmo pacote, senão a reprodução local mente.

## 2. Gate `changed` (workflow `update-data.yml`)

O updater commita internamente, então `git status` depois dele fica limpo e não
serve de sinal. O gate compara o commit:

```sh
before=$(git rev-parse HEAD)
node scripts/update-data.mjs
after=$(git rev-parse HEAD)
```

- `before != after` → houve commit de dados: build, upload e deploy.
- Árvore suja nos caminhos de dados → **fallback**: o workflow commita o que ficou
  solto, com `::warning::`, para nunca publicar um `dist` sem o dado versionado.
- No-op (nenhum resultado novo, ou regeneração idêntica) → `changed=false`, nenhum
  build nem deploy; o run termina rápido e verde.

Caminhos que contam como dado: `src/currentSeasonResults.ts`, `src/projectionData.ts`,
`src/sourceMetadata.ts`, `src/advancedStats2026.ts`, `src/scorers2026.ts`,
`data/source-snapshots`, `docs/atualizacoes.md`.

## 3. Coleta same-day

`planCollectionRun({ today, lastCutoffDate })` em `scripts/lib/dataPipeline.mjs`
decide o escopo por comparação de dias UTC:

| relação | resultado | efeito |
|---|---|---|
| `today < lastCutoffDate` | `{ collect: false }` | no-op: corte no futuro, nada a fazer |
| `today == lastCutoffDate` | `{ collect: true, refreshSecondary: false }` | re-coleta **primária** (ESPN + Football-Data); secundárias preservadas |
| `today > lastCutoffDate` | `{ collect: true, refreshSecondary: true }` | coleta completa, com xG/cartões (365scores) e eventos ESPN da artilharia |

Mesmo dia existe porque um jogo que termina depois do corte não pode esperar ~24h.
Fontes secundárias têm orçamento próprio por ciclo: `ESPN_SCORERS_CONCURRENCY`
(opcional, padrão 6) e pausa `THREE_SIX_FIVE_PAUSE_MS`.

## 4. Invariantes (falha = não publica)

Verificadas por `validateIntegrity` e `validateAdvancedStats`:

- **380 tuplas** no calendário CBF (`src/cbfOfficialSchedule.ts`); `loadCbfSchedule`
  aborta se o número mudar.
- **Par ordenado único** (`casa:fora`) em disputados, pendentes e registros avançados.
- **`disputados + pendentes = 380`** e nenhum par fora do calendário.
- **SHA-256 das fontes** declarado por fonte em `src/sourceMetadata.ts`
  (Football-Data, ESPN concatenado, CBF, histórico) e conferível contra
  `data/source-snapshots/`.
- **xG**: contagem de registros avançados igual ao número de jogos disputados e
  `|ΣxG − Σgols| / Σgols ≤ 25%` (`xgTolerance` em `scripts/lib/threesixfive.mjs`).
- **Conciliação externa**: divergência de classificação acima de 2 clubes contra a
  ESPN aborta a publicação (indício de resultado perdido).

## 5. Regra de ouro: nenhum fato do pacote literal

Corte analítico, contagens de resultados/pendentes/atletas e datas de captura mudam
a cada coleta. Escrevê-los à mão em teste ou copy transforma a atualização automática
em falha de release — foi assim que o pipeline parou por dias.

- Derive de `src/seasonFacts.ts` (`seasonFacts`, `historicalFacts`, `cutoffLabel`,
  `scorersCaptureRelation`) e de `src/sourceMetadata.ts`; a UI nunca cita o número.
- O sentinela `scripts/data-assertions.test.mjs` reprova data de corte em BRT,
  instante ISO literal dentro de asserção e contagens do pacote em
  `toHaveLength`/`toBe`. `380` é invariante estrutural e é permitido.
- Opt-out na mesma linha do literal: `// data-fixa: <motivo>`, só para fixture
  sintética ou registro histórico imutável — nunca para o corte vigente.
- O sentinela é tripwire de linha, não prova: um literal guardado em variável e
  afirmado depois ainda passa. Por isso os testes de dados importam os módulos.

## 6. Alerta de frescor do Pages (não é gate)

`scripts/check-deploy-freshness.mjs`, job `freshness` em `.github/workflows/pages.yml`
(`needs: deploy`, só em push para `main`):

- Lê `ANALYTICAL_CUTOFF_UTC`/`_LOCAL` de `src/sourceMetadata.ts` (ou `--expect=`),
  busca o site publicado, extrai `assets/index-*.js` e procura o corte no bundle.
- 1 sondagem imediata + até 2 retries (15s/30s, `FRESHNESS_BACKOFF_MS`) para
  propagação do CDN.
- Resultado **sempre** em `::notice::` (em dia) ou `::warning::` (defasagem
  suspeita); rede/CDN indisponível também vira `::notice::`. Sai com código 0,
  com `continue-on-error` no job e no passo: nunca atrasa, condiciona ou reprova
  o deploy. Se aparecer warning recorrente, é sinal de build publicado errado, não
  de pipeline quebrado.

## 6.1. Alarme de defasagem do pacote (independe de push)

`scripts/check-data-freshness.mjs` + `scripts/lib/freshness.mjs`, workflow
`.github/workflows/data-freshness.yml` (cron `0 9,15,21 * * *` + dispatch):

- Lê apenas `ANALYTICAL_CUTOFF_UTC` de `src/sourceMetadata.ts` (ou `--cutoff=`) e
  compara com o relógio: sem rede, sem `npm ci`, sem dependência nova.
- `--max-age-hours` (padrão 24) é o limite; limite **inclusivo** — idade igual ao
  limite já é defasagem. Sai 0 fresco, 1 defasado, 2 erro de parsing (corte
  ausente/inválido). Diferente do alarme do Pages, este reprova o run.
- Em falha, abre/comenta/reabre a issue `[alarme] Pacote de dados defasado`
  **após 2 falhas consecutivas** (contadas por `gh run list`); se `gh` não
  listar os runs, abre assim mesmo (lado ruidoso). Quando volta a passar, comenta
  e fecha a issue.
- Existe porque o alarme do Pages só roda em push/deploy: quando o updater parou
  de empurrar, ele nunca executou e a defasagem ficou dias em silêncio.

## 7. Checklist ao mexer no pipeline

1. `npm test` — suíte completa, incluindo o sentinela de dados.
2. `npm run build` — `tsc -b` + Vite; o build não pode depender de dado de rede.
3. `npm run smoke:pages` — rebuilda com `GITHUB_PAGES=true` e valida assets e o
   worker sob `/brasileirao-2026/`.
4. Provar o gate `changed` em clone descartável: rodar o updater, conferir
   `before != after` com dado novo e `changed=false` na segunda execução.
5. Não reescrever histórico nem dar `git add -A`: o updater e outras sessões mexem
   nos mesmos arquivos.
