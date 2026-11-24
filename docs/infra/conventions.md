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
                                      ├─► docs/atualizacoes.md     (log público por execução)
                                      └─► public/projecoes.json    (Monte Carlo de produção)
                                                    │
                                                    ▼
                                     npm run build (Vite, dist/ estático) ──► GitHub Pages
```

- `scripts/update-data.mjs` coleta, concilia, valida, regenera os módulos TS,
  regenera `public/projecoes.json` (`scripts/generate-projections.mjs`, a mesma
  `runProjectionRaw` do worker com as constantes de produção), roda a suíte e
  **commita** o pacote. Ele não faz push nem deploy: isso é do workflow. O
  contrato do arquivo de projeções está em `docs/projecoes-json.md`.
- Fontes secundárias (`scripts/backfill-xg-cards.mjs` → 365scores,
  `scripts/refresh-espn-scorers.mjs` → eventos de partida da ESPN para a artilharia)
  rodam sempre que há rede. O xG/cartões regrava quando `shouldRefreshSecondary`
  aprova — `addedCount > 0 || today > lastCutoffDate` — ou quando a captura está
  vencida com jogo posterior (`secondaryRefreshDue`, ver §3); a artilharia roda em
  toda execução com rede, fora do guard de dia. As duas falham de forma branda
  (mantêm o snapshot e o módulo anteriores), e cobertura menor que a publicada não
  é gravada (`SECONDARY_REGRESSION`). O contrário também vale: registro cujo par o
  pacote ainda lista como pendente não é publicado (`SECONDARY_OUTSIDE_PACK`) —
  a fonte pode encerrar um jogo antes do pacote (regra conservadora do dia do
  corte) e `matches > expected` faria a UI anunciar cobertura parcial sem nada
  faltando. O registro bruto fica no cache e volta quando o pacote o incorpora.
  O denominador (`coverage.expected`) vem dos pares que a execução vai publicar
  (pacote anterior + mergeados), passado explicitamente pelo updater: as
  secundárias rodam **antes** da escrita de `src/currentSeasonResults.ts`, então
  reler o módulo do disco publicaria o total do pacote anterior (já quebrou o
  gate com `expected 349` para um pacote de 352).
  `scripts/refresh-apifutebolbr.mjs` foi **removido** (trial encerrado, HTTP 429 permanente).
- Artilharia: um snapshot normalizado por partida em
  `data/source-snapshots/espn-events-<eventId>.json`; o módulo `src/scorers2026.ts` é
  agregado desses snapshots (nunca da rede direto) e declara cobertura. Cartões do ESPN
  servem só de corroboração em log — a fonte de xG/cartões do produto continua a 365scores.
- Classificação, projeções Monte Carlo e análises são derivadas **no cliente**, em
  runtime, a partir dos módulos versionados. Nada de número pré-calculado em build.
- Sem rede (`--dry-run` ou ausência de `FETCH`), o updater lê os snapshots locais:
  o modo offline precisa produzir o mesmo pacote, senão a reprodução local mente.
- `--dry-run` não escreve nenhum caminho versionado, inclusive as fontes secundárias:
  xG/cartões e artilharia recebem `write: false` (snapshot e módulo preservados) e
  apenas a coleta, o diff e o resumo vão para o console.

## 2. Gate `changed` (workflow `update-data.yml`)

O updater commita internamente, então `git status` depois dele fica limpo e não
serve de sinal. O gate compara o commit:

```sh
before=$(git rev-parse HEAD)
node scripts/update-data.mjs
after=$(git rev-parse HEAD)
```

- `before != after` → houve commit de dados: suíte completa, push e publicação pelo
  workflow reutilizável (`_pages-build-deploy.yml`, §2.2).
- Falha do updater → step vermelho com `::error::` listando `git status --porcelain`
  nos caminhos de dados. **Não existe fallback** que commite árvore suja: o que o
  updater não validou não é publicado, nem fica como alteração solta no runner.
  O próprio updater grava `.pantheon/logs/update-data-failure-<UTC>.json` (caudas
  de stdout/stderr redigidas, flags, corte e caminhos escritos nesta execução) e
  imprime a instrução de restauração só para esses caminhos (`git checkout --`
  para rastreado, `rm --` para snapshot novo). O recibo compara o conteúdo com um
  baseline capturado antes da escrita: sujeira pré-existente nunca é atribuída ao
  updater. O recibo é diagnóstico, não autorização para publicar.
- No-op (nenhum resultado novo, ou regeneração idêntica) → `changed=false`, nenhum
  build nem deploy; o run termina rápido e verde.

### 2.1. Gate em duas camadas

| camada | onde roda | escopo | por quê |
|---|---|---|---|
| contrato de dados | `npm run test:data`, default do updater | sentinela de dados, parsers, módulos de dados e estatística pura — nunca UI/jsdom | a ingestão não pode ser refém de teste de apresentação que depende do pacote |
| suíte completa | `npm test`, step `Full test suite gate` no workflow | repositório inteiro | regressão de UI/renderização continua bloqueando a publicação |

`--no-projections` existe só para os harnesses de reprodução (`repro:gate`,
`fixture:gate`), que executam o updater várias vezes: a simulação de produção
custa ~18 s e não prova nada sobre o gate. Nenhum outro caminho usa a flag — o
pacote publicado sempre inclui `public/projecoes.json`.

O updater falha alto no contrato de dados; o workflow roda a suíte completa só
quando `changed == 'true'` e **antes** do push, então um teste vermelho bloqueia a
publicação mesmo já havendo commit local. Para reproduzir o gate completo no
updater, `--test="npm test"`; o default não volta ao gate completo.

Push do commit de dados: até 3 tentativas com `git fetch origin main` +
`git rebase origin/main`; conflito em arquivo gerado aborta o rebase e o run com
`::error::` (intervenção humana), nunca `--force`.


Caminhos que contam como dado: `src/currentSeasonResults.ts`, `src/projectionData.ts`,
`src/sourceMetadata.ts`, `src/advancedStats2026.ts`, `src/scorers2026.ts`,
`data/source-snapshots`, `docs/atualizacoes.md`, `public/projecoes.json`.

### 2.2. Publicação — um único workflow reutilizável

`.github/workflows/_pages-build-deploy.yml` (`workflow_call` + `workflow_dispatch`)
é o **único** lugar que builda com `GITHUB_PAGES=true`, roda `smoke:pages`, sobe o
artefato (`upload-pages-artifact`) e faz `deploy-pages`. Os dois publicadores
chamam o mesmo arquivo:

| caller | job | quando publica |
|---|---|---|
| `pages.yml` | `pages`, `needs: test` | push em `main` |
| `update-data.yml` | `pages`, `needs: update` | `changed == 'true'` |

- Push feito com `GITHUB_TOKEN` **não** dispara outros workflows: o commit do bot
  só chega ao Pages porque o próprio `update-data.yml` chama o reutilizável.
  Remover esse deploy pararia a publicação de dados.
- Os gatilhos são disjuntos (push humano → `pages.yml`; push do bot →
  `update-data.yml`), então não há corrida entre callers. Ainda assim o
  reutilizável declara `concurrency: { group: pages, cancel-in-progress: false }`
  para serializar qualquer publicação e o ambiente `github-pages`.
- O job que chama precisa declarar `contents: read`, `pages: write` e
  `id-token: write` em `jobs.<id>.permissions`: o token entregue ao reutilizável
  só pode ser reduzido, nunca elevado, e sem `permissions` no job o chamado
  recebe os defaults do repositório em vez das permissões de Pages.
- `npm test` fica nos callers (job `test` de `pages.yml`; step `Full test suite
  gate` do updater). O reutilizável não repete a suíte.
- O checkout do reutilizável usa `inputs.sha || github.sha`, e os dois callers
  passam `with: sha`. Sem o input, um workflow chamado faz checkout do SHA do
  **evento do caller** — no cron, o commit anterior ao commit do bot — e o Pages
  publicaria dado velho. `pages.yml` passa `github.sha` (o commit que os testes
  acabaram de validar); `update-data.yml` passa o HEAD que o step `push`
  empurrou (o `after` do gate pode mudar se o push precisar de rebase).
- `freshness` em `pages.yml` usa `needs: pages` e continua sendo alerta, não gate.

### 2.3. Gate de pre-commit (condicional por caminho)

`.githooks/pre-commit` não roda mais a suíte completa em todo commit: ele executa
`node scripts/pre-commit-gate.mjs`, que lê os caminhos staged
(`git diff --cached --name-only --diff-filter=ACMR`) e classifica com o módulo puro
`scripts/lib/commitGate.mjs`.

| caminhos staged | modo | comandos (nesta ordem) |
|---|---|---|
| todos na allowlist | `data-only` | `git diff --cached --check`, `npm run test:data` |
| qualquer caminho fora | `full` | `git diff --cached --check`, `npm test`, `GITHUB_PAGES=true npm run build` |

Allowlist — idêntica a `data_paths` do step de coleta em
`.github/workflows/update-data.yml`; o teste compara as duas listas e reprova a
divergência:

- `src/currentSeasonResults.ts`, `src/projectionData.ts`, `src/sourceMetadata.ts`,
  `src/advancedStats2026.ts`, `src/scorers2026.ts`
- prefixo `data/source-snapshots/`
- `docs/atualizacoes.md`, `public/projecoes.json`

- O commit interno do updater (`scripts/update-data.mjs`) cai em `data-only`: é o
  mesmo contrato que ele já roda antes de commitar, então o hook não repete a
  suíte inteira nem falha por UI alheia ao pacote. Qualquer edição de código,
  teste, config ou workflow força `full`.
- **Fail-safe**: lista vazia (inclusive `git commit --allow-empty`), caminho
  inválido, entrada que não é lista, exceção no classificador ou falha ao listar
  o stage (`git` indisponível) → `full`, com aviso. Não existe ramo que retorne
  sucesso sem checar.
- `scripts/lib/commitGate.test.mjs` faz parte de `npm run test:data`: o gate de
  dados valida o próprio seletor.
- **`--no-verify` é proibido** neste repositório. O hook é o contrato local; se
  ele bloqueia, o problema é o commit (ou o stage), não o gate.
- Prova offline, sem `git add` e sem executar teste/build:

  ```sh
  PRE_COMMIT_DRY_RUN=1 node scripts/pre-commit-gate.mjs --paths src/currentSeasonResults.ts
  PRE_COMMIT_DRY_RUN=1 node scripts/pre-commit-gate.mjs --paths src/App.tsx
  PRE_COMMIT_DRY_RUN=1 node scripts/pre-commit-gate.mjs --paths ""
  ```

  As saídas são, respectivamente, `data-only` + `npm run test:data`, `full` +
  `npm test` + build de Pages, e `full` (fail-safe). `--paths` aceita lista
  separada por vírgula e substitui a leitura do stage.

## 3. Coleta same-day

`planCollectionRun({ today, lastCutoffDate })` em `scripts/lib/dataPipeline.mjs`
decide o escopo por comparação de dias UTC:

| relação | resultado | efeito |
|---|---|---|
| `today < lastCutoffDate` | `{ collect: false }` | no-op: corte no futuro, nada a fazer |
| `today == lastCutoffDate` | `{ collect: true, refreshSecondary: false }` | re-coleta **primária** (ESPN + Football-Data); secundárias só se `addedCount > 0` (resultado novo no mesmo dia UTC) |
| `today > lastCutoffDate` | `{ collect: true, refreshSecondary: true }` | coleta completa, com xG/cartões (365scores) e eventos ESPN da artilharia |

Mesmo dia existe porque um jogo que termina depois do corte não pode esperar ~24h.
A decisão final das secundárias é `shouldRefreshSecondary({ today, lastCutoffDate,
addedCount })` (`addedCount > 0 || today > lastCutoffDate`), tomada depois do merge;
o guard de dia sozinho congelava a captura. Fontes secundárias têm orçamento próprio
por ciclo: `ESPN_SCORERS_CONCURRENCY` (opcional, padrão 6) e pausa
`THREE_SIX_FIVE_PAUSE_MS`.

**Sem resultado novo não é no-op quando a captura secundária venceu.** Os caminhos
`no-input` e `duplicates-only` saem cedo — mas só depois de
`secondaryRefreshDue({ fetchedAt, now, packagedResults })` (`scripts/lib/freshness.mjs`)
responder `false`. A condição é `true` somente com captura acima de
`DEFAULT_SECONDARY_MAX_AGE_HOURS` (168h, limite inclusivo) **e** ao menos uma partida
do pacote com kickoff posterior a `fetchedAt` — jogo que a captura não podia ter
visto. Com ESPN o kickoff tem fuso e é comparado por instante; Football-Data não
declara fuso e é comparado pela data (o dia inteiro conta como visto), a mesma regra
de `isAtOrBeforeAnalyticalCutoff`. Nesse caso o updater executa o 4b
(`planSecondarySources` com `refreshAdvancedDue: true`), regenera
`public/projecoes.json` se algo mudou e commita — sem tocar nos módulos primários,
porque adiantar o corte analítico sem resultado novo declararia incorporado um
intervalo que não foi coletado. `--offline`/`--dry-run` sem `FETCH` preservam a saída
cedo; `--today` usa o fim desse dia UTC como "agora" (reprodução determinística).
Rodar de novo com a captura já fresca volta a sair cedo: nada de commit vazio.

## 4. Invariantes (falha = não publica)

Verificadas por `validateIntegrity` e `validateAdvancedStats`:

- **380 tuplas** no calendário CBF (`src/cbfOfficialSchedule.ts`); `loadCbfSchedule`
  aborta se o número mudar.
- **Par ordenado único** (`casa:fora`) em disputados, pendentes e registros avançados.
- **`disputados + pendentes = 380`** e nenhum par fora do calendário.
- **SHA-256 das fontes** declarado por fonte em `src/sourceMetadata.ts`
  (Football-Data, ESPN concatenado, CBF, histórico) e conferível contra
  `data/source-snapshots/`.
- **xG**: o módulo declara `coverage { matches, expected, missing }`; `matches` é
  o número de jogos do pacote com registro, `expected` é o total de jogos encerrados
  do pacote e `missing` lista os pares sem registro. Cobertura parcial é publicada
  como parcial, nunca como completa; publicação menor que a anterior é regressão.
  `|ΣxG − Σgols| / Σgols ≤ 25%` sobre os jogos cobertos (`xgTolerance` em
  `scripts/lib/threesixfive.mjs`).
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
- O contrato de dados (`npm run test:data`, §2.1) é o que o updater roda: ele
  cobre sentinela, parsers e módulos de dados. A suíte completa continua sendo o
  gate de publicação no workflow — teste de UI que dependa do pacote não bloqueia
  a coleta, mas bloqueia o push.

## 6. Sonda de frescor do Pages (não é gate)

`scripts/check-deploy-freshness.mjs` compara o bundle publicado
(`assets/index-*.js`) com o repositório. Duas identidades são aceitas:

- `--expect-sha=<sha>` procura o SHA do build (`__BUILD_SHA__`, gravado por
  `vite.config.ts`; completo ou prefixo ≥7) dentro do bundle. É a checagem mais
  forte: o SHA só está no arquivo se o build veio daquele commit — que também
  contém o corte.
- Sem `--expect-sha`, procura `ANALYTICAL_CUTOFF_UTC`/`_LOCAL` de
  `src/sourceMetadata.ts` (ou `--expect=<corte>`): o contrato antigo, preservado
  para uso manual.

`--backoff=0,30000,120000` define as esperas entre sondagens (padrão 15s/30s).
`--strict` troca o modo advisory pelos códigos de saída 0 (em dia), 1 (bundle
de outro commit) e 2 (não foi possível verificar: rede/HTTP ou argumento
inválido). Sem `--strict` o script é o alarme de sempre: sai 0, escreve
`::notice::`/`::warning::` e nunca derruba o run.

## 6.1. Duas camadas: sonda advisory no deploy + sonda agendada strict

| camada | onde | quando roda | código de saída |
|---|---|---|---|
| advisory | job `freshness` de `pages.yml` (`needs: pages`) | só em push para `main`, depois de publicar | sempre 0, `continue-on-error` |
| strict | job `published` de `data-freshness.yml` | cron `0 9,15,21 * * *` + dispatch, sem `npm ci` | 0 em dia; 1/2 reprovam o run |

- A camada advisory dá contexto no run que publicou, mas não vê o deploy que
  nunca aconteceu: ela só roda atrás de um push.
- A camada strict fecha a lacuna. Faz checkout de `main`, compara o bundle com
  o HEAD (`--expect-sha --strict`) e, antes de concluir falha, consulta
  `gh run list --workflow=pages.yml --limit 3 --json status`; se houver run
  `in_progress`/`queued`, emite `::notice::Propagação de deploy em curso` e
  encerra em 0, porque o commit pode estar a caminho.
- A issue `[alarme] Site publicado defasado` segue a política do alarme de
  dados: abre/comenta/reabre na segunda falha consecutiva (contada por
  `gh run list`), dedupe por título, e fecha quando o bundle volta a bater.
  Diferente do alarme de dados, o run fica vermelho em toda falha: a contagem
  lê `conclusion`, e um run verde nunca acumularia a sequência.
- Janela de propagação: na medição que originou esta sonda, 1 em 3 deploys
  consecutivos ainda via o bundle anterior na primeira tentativa. Por isso o
  strict espera 0s/30s/120s antes de acusar — e a guarda de deploy em curso
  decide antes da issue. A janela real depende do CDN; o padrão advisory
  continua 15s/30s.

## 6.2. Alarme de defasagem do pacote (independe de push)

`scripts/check-data-freshness.mjs` + `scripts/lib/freshness.mjs`, workflow
`.github/workflows/data-freshness.yml` (cron `0 9,15,21 * * *` + dispatch):

- Lê `ANALYTICAL_CUTOFF_UTC` de `src/sourceMetadata.ts` (ou `--cutoff=`) e
  compara com o relógio: sem rede, sem `npm ci`, sem dependência nova.
- `--max-age-hours` (padrão 24) é o limite; limite **inclusivo** — idade igual ao
  limite já é defasagem. Sai 0 fresco (ou sem resultado a publicar), 1 defasado,
  2 erro de parsing (corte ausente/inválido). Diferente do alarme do Pages, este
  reprova o run: o passo de checagem **não** usa `continue-on-error`, senão todo
  run conclui `success` e a contagem por `conclusion` nunca sai de zero.
- Idade sozinha não distingue entressafra de resultado perdido. Acima do limite,
  o alarme lê os snapshots `espn-scoreboard-*.json` e só reprova se houver
  partida **encerrada** (`events[].status.type.state == 'post'`) com kickoff em
  `(corte, agora - 6h]`; a carência cobre o tempo entre o apito final e a
  publicação da fonte. Sem esse jogo, o corte parou porque não havia resultado a
  incorporar: o run termina 0 com `::notice::` de entressafra/parada, o que
  também fecha a issue. Evento `pre` que virou passado não conta — pode ser
  adiamento, cancelamento ou o snapshot tirado antes da rodada.
- `--ignore-calendar` desliga a consulta e restaura a decisão só por idade. Sem
  snapshot legível (diretório ausente, nenhum `espn-scoreboard-*.json`, JSON
  quebrado), o alarme também volta ao modo ruidoso e explica com `::warning::`
  "decisão por idade crua": falha de leitura nunca vira "sem jogo".
  `--snapshots-dir=` aponta outro diretório (testes/inspeção); o padrão é
  `data/source-snapshots`.
- `--secondary-max-age-hours` (padrão 168 = 7 dias) aplica a mesma decisão à
  captura de xG/cartões (`fetchedAt` de `src/advancedStats2026.ts`): com jogo
  encerrado no pacote (`src/currentSeasonResults.ts`), captura acima do limite
  reprova com `::error::SECONDARY_STALE`; sem jogo encerrado (entressafra), a
  regra não se aplica. `--ignore-secondary` desliga a regra e explica com
  `::notice::`. Nenhuma das checagens faz rede.
- Em falha, abre/comenta/reabre a issue `[alarme] Pacote de dados defasado`
  **após 2 falhas consecutivas** (contadas por `gh run list`); se `gh` não
  listar os runs, abre assim mesmo (lado ruidoso). Quando volta a passar, comenta
  e fecha a issue.
- Existe porque o alarme do Pages só roda em push/deploy: quando o updater parou
  de empurrar, ele nunca executou e a defasagem ficou dias em silêncio.

## 7. Checklist ao mexer no pipeline

1. `npm run test:data` durante o ciclo do pipeline e `npm test` — suíte completa,
   incluindo o sentinela de dados — no gate final.
2. `npm run build` — `tsc -b` + Vite; o build não pode depender de dado de rede.
3. `npm run smoke:pages` — rebuilda com `GITHUB_PAGES=true` e valida assets e o
   worker sob `/brasileirao-2026/`.
4. Provar o gate `changed` em clone descartável: rodar o updater, conferir
   `before != after` com dado novo e `changed=false` na segunda execução.
5. `npm run repro:gate` — prova offline os dois cenários do gate (vermelho com
   recibo de falha, verde sem recibo). Roda com árvore suja: captura um baseline
   byte-a-byte dos caminhos de dados e restaura no `finally`, provando que o
   `git status --porcelain` desses caminhos é idêntico antes/depois — nunca
   `git checkout` sobre trabalho alheio.
6. Não reescrever histórico nem dar `git add -A`: o updater e outras sessões mexem
   nos mesmos arquivos.

## 8. Dependências

- **Versões exatas no manifesto.** `package.json` não usa `latest`, `^` nem `~`:
  a string é a versão resolvida. `latest` fazia a instalação depender do dia do
  clone, não do que foi testado.
- **`package-lock.json` é a fonte de verdade.** `npm ci` instala exatamente o
  lock; mudança de dependência aparece como diff do lock e é revisada como
  código. Um diff de lock que altere `node_modules/<pkg>/version` é atualização
  de dependência, não efeito colateral de outra tarefa.
- **Atualização só em PR dedicado, mensal**, uma dependência por vez:

  ```sh
  npm outdated
  npm install <pkg>@<x.y.z>
  npm test
  GITHUB_PAGES=true npm run build && npm run smoke:pages
  ```

- **Nunca `npm update`** no meio de outra tarefa: ele reescreve o lock inteiro e
  esconde regressão dentro de um diff de feature.
- **Runtime declarado**: `engines.node` é `>=24` e `.nvmrc` é `24`. O mínimo é
  Node 24, que é o que o CI pina; o ambiente de desenvolvimento pode ser mais
  novo sem virar `EBADENGINE`. `@types/node` acompanha a versão resolvida, não um
  range (dívida conhecida: types acima do runtime do CI deixam passar API que o
  CI não tem).
- **Dependência nova exige justificativa**: prefira a stdlib; se entrar, entra em
  versão exata e com teste que a exercite.
- `CHANGELOG.md` registra a versão pública; `scripts/release-consistency.test.mjs`
  reprova se a primeira versão publicada divergir de `package.json`.
