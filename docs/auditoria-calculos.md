# Auditoria de Cálculos — Painel Brasileirão 2026

Relatório da auditoria das fórmulas do sistema, com o status de cada item e o
efeito nas grandezas publicadas. O comparativo "antes → depois" foi obtido
executando a projeção completa (20.000 simulações, mesma semente) no commit
inicial (`9f33308`) e no código corrigido.

Legenda de status:

- **Corrigido** — o comportamento mudou neste refatoramento.
- **Documentado** — comportamento mantido, agora declarado explicitamente em código/UI.
- **Mantido (limitação)** — decisão consciente, registrada como limitação.

## 1. Fórmulas duplicadas com guardas divergentes — **Corrigido**

`projection.ts` reimplementava três fórmulas que já existiam em `matchModel.ts`:

| Fórmula | Cópia removida | Fonte única atual |
|---|---|---|
| Média de gols por mando | `projection.ts:197-203` (sem guarda; lista vazia → `NaN` por divisão por zero) | `matchModel.ts` `historicalGoalAverages` (guarda: devolve `{home: 1, away: 1}`) |
| Gols esperados por força de ataque/defesa com encolhimento | `projection.ts:251-268` (`expectedGoalsForTeams`) | `matchModel.ts` `expectedGoalsFromTeamTotals` (idêntica, com guarda adicional para denominador zero) |
| Probabilidades H/E/F via Poisson truncada em 12 gols | `projection.ts:286-307` (`poissonProbabilities` + `resultProbabilities`) | `matchModel.ts` `poissonResultProbabilities` |

**Risco eliminado:** divergência silenciosa entre as duas cópias em manutenção
futura (o backtest de partida usava uma cópia e o treino de produção, a outra).

**Guardas adicionadas:** `expectedGoalsFromTeamTotals` agora devolve
multiplicadores neutros quando `jogos + k = 0` e preserva as médias quando
`μ = 0`; Brier com fold de teste vazio devolve `0` em vez de `NaN`
(`projection.ts` `evaluateHistoricalYear` e `modelBacktest.ts` `scoreMatches`);
`relativeImprovement` guarda divisão por baseline zero.

## 2. μ exibida ≠ μ usada pelo modelo — **Corrigido**

- **Antes:** a metodologia exibia `leagueAverageGoals` (média do histórico puro
  2021–2025, 1.900 jogos) como se fosse a μ do modelo, mas o modelo de produção
  calculava μ sobre histórico **+ 332 jogos de 2026 até o corte**
  (`buildProductionTrainingMatches`).
- **Depois:** `ProjectionResult` expõe as duas (`leagueAverageGoals` e a nova
  `trainingGoalAverages`), e a metodologia declara qual é usada pelo modelo e
  qual é referência editorial.

## 3. Três definições de "Libertadores" — **Corrigido (unificadas em `ZONES`)**

- **Antes:** probabilidades por clube contavam 1º–5º; as categorias exclusivas
  da distribuição de pontos usavam 2º–5º; a legenda da classificação marcava
  1º–6º como "faixa de classificação" — a mesma palavra com três fronteiras.
- **Depois:** `projectionConfig.ts` define `ZONES` (Libertadores 1º–5º,
  Sul-Americana 6º–11º, meio 12º–16º, rebaixamento 17º–20º) usada pela
  contagem da simulação, pelos rótulos das categorias exclusivas e pela
  legenda/filtros da classificação (`data.ts`). As categorias exclusivas
  continuam separando o campeão apenas para nomear "Libertadores · 2º–5º".

## 4. Desempate H2H sem o terceiro critério CBF — **Corrigido**

- **Antes:** o confronto direto entre dois clubes comparava pontos e saldo no
  confronto e caía direto no sorteio — ignorando **gols marcados no confronto**,
  previsto no REC (critério 3).
- **Depois:** `HeadToHeadRecord` ganha `goalsFor`; `compareHeadToHeadForTable`
  aplica pontos → saldo → gols pró no confronto. A simulação acumula o novo
  campo nos jogos restantes.
- Empates entre **3+ clubes** seguem por sorteio reprodutível (limitação
  mantida: cartões e sorteio oficial não existem nos dados — documentado na UI).

## 5. k de produção escolhido in-sample — **Corrigido (walk-forward)**

- **Antes:** `k` de encolhimento da produção era o melhor candidato somando o
  Brier das **mesmas cinco temporadas exibidas** (seleção dentro da amostra —
  viés de seleção no número publicado). Valor: `k=15`.
- **Depois:** `k` de produção é o escolhido para a temporada 2025 usando apenas
  os anos anteriores (fora da amostra), a mesma política walk-forward exibida na
  tabela anual. Valor: `k=20` (tanto em `modelBacktest.ts` quanto em
  `runTemporalBacktest`).

## 6. Teste de conservação de pontos tautológico — **Corrigido**

- **Antes:** o teste comparava a soma da tabela com `totalPoints`, que era
  recomputado **da própria tabela** — verificação de identidade, não de conservação.
- **Depois:** o teste afirma `pointsAtStart + pointsAdded === totalPoints`
  (pontos do snapshot + pontos distribuídos nos 48 jogos simulados = total final).

## 7. `buildPointsAnalysis` aceitava pontos negativos — **Corrigido**

Pontuação negativa não existe no formato de pontos corridos; amostras
corrompidas agora são descartadas (antes apenas não-inteiras eram filtradas).

## 8. `validateCurrentSeason` misturava bases de contagem — **Corrigido**

`completedMatches` passou a refletir a base **filtrada pelo corte** (a mesma
das estatísticas), em vez do array bruto.

## 9. Alias de ID de clube aplicado inconsistentemente — **Corrigido**

O mapeamento `saopaulo → sao-paulo` vivia só em `modelBacktest.ts`. Agora existe
um normalizador único (`clubIds.ts` `normalizeTeamId`) usado por todos os
empacotadores de partidas históricas (`projection.ts`, `modelBacktest.ts`,
`seasonStats.ts`), incluindo `officialStandings` no backtest de tabela e na
validação histórica.

## 10. Empate na seleção de k favorece o primeiro candidato — **Documentado**

A seleção usa `<` estrito sobre somas de float com inicializador
`SHRINKAGE_CANDIDATES[0]`; empates exatos mantêm o candidato de menor k. O
comportamento é determinístico e agora está declarado aqui; não altera resultados.

## 11. Snapshot capturado após o corte — **Documentado**

`currentClubs`/`standings` foram capturados ~16:41 BRT, corte 13:00 BRT. A
consistência é garantida por teste de reconciliação e pela guarda
`validateCurrentSeason` (que degrada para `mismatchedClubs = 20` se qualquer
gol entre 13:00–16:41 quebrasse a paridade). Sem mudança de comportamento.

## 12. Corte conservador de Football-Data por string de data — **Documentado**

Registros sem fuso (Football-Data) usam comparação de string de data
(`< 2026-11-04`), descartando o dia limítrofe inteiro; ESPN usa timestamp com
fuso. Assimetria consciente, registrada no README e na UI.

## 13. `lowSample` por largura de IC com limiar fixo — **Documentado**

"Amostra baixa" = IC 95% com largura ≥ 0,10 (comparação de floats sobre limites
já limitados a [0,1]). Definição mantida e agora documentada no dicionário de dados.

## 14. Seleção in-sample do k (variante casa/fora) na tabela de ablação — **Documentado**

Os `k` por temporada da ablação seguem a política walk-forward (apenas anos
anteriores); o que era in-sample era somente o `k` de produção (item 5).

## Impacto nas probabilidades publicadas

Execução completa antes/depois (20.000 simulações, semente 20261104). As
mudanças vêm do novo `k=20` walk-forward (item 5) e do desempate H2H com gols
pró (item 4). Diferenças ≤ 1,1 ponto percentual:

| Clube | Título | Libertadores | Rebaixamento |
|---|---|---|---|
| Flamengo | 80,56% → 80,67% | 100,00% → 100,00% | 0,00% → 0,00% |
| Palmeiras | 19,43% → 19,33% | 100,00% → 100,00% | 0,00% → 0,00% |
| Cruzeiro | 0,00% → 0,00% | 94,89% → 95,19% | 0,00% → 0,00% |
| Fluminense | 0,00% → 0,00% | 64,35% → 65,19% | 0,00% → 0,00% |
| Athletico-PR | 0,00% → 0,00% | 77,00% → 76,67% | 0,00% → 0,00% |
| Bahia | 0,00% → 0,00% | 44,73% → 43,62% | 0,00% → 0,00% |
| Atlético-MG | 0,00% → 0,00% | 18,05% → 18,30% | 0,00% → 0,00% |
| São Paulo | 0,00% → 0,00% | 0,16% → 0,11% | 0,06% → 0,07% |
| Coritiba | 0,00% → 0,00% | 0,00% → 0,00% | 9,30% → 9,00% |
| Mirassol | 0,00% → 0,00% | 0,00% → 0,00% | 17,68% → 17,36% |
| Botafogo | 0,00% → 0,00% | 0,00% → 0,00% | 8,43% → 7,85% |
| Vasco da Gama | 0,00% → 0,00% | 0,00% → 0,00% | 14,13% → 14,59% |
| Vitória | 0,00% → 0,00% | 0,00% → 0,00% | 22,16% → 22,60% |
| Internacional | 0,00% → 0,00% | 0,00% → 0,00% | 31,10% → 31,32% |
| Grêmio | 0,00% → 0,00% | 0,00% → 0,00% | 48,24% → 47,70% |
| Corinthians | 0,00% → 0,00% | 0,00% → 0,00% | 49,10% → 49,75% |
| Remo | 0,00% → 0,00% | 0,00% → 0,00% | 99,80% → 99,76% |
| Chapecoense | 0,00% → 0,00% | 0,00% → 0,00% | 100,00% → 100,00% |

## Precisão numérica (contexto)

- Não existem valores monetários nem pontos fracionários: toda a pontuação é
  inteira (3/1/0) e acumulada de inteiros; igualdades `===` sobre pontos são seguras.
- Floats aparecem em λ (gols esperados), probabilidades e Brier. As somas de
  Poisson são renormalizadas (verificadas por teste com `toBeCloseTo(…, 12)`).
- Toda a formatação de exibição usa `Intl.NumberFormat` (arredondamento
  `halfExpand` apenas na camada de apresentação; os dados exportados em
  CSV/XLSX/JSON carregam a precisão original).
- Novos testes de borda: base vazia, denominador zero, pontos negativos,
  percentis em amostra ímpar com valores repetidos, conservação de pontos e
  desempate H2H nos três critérios.


## 15. Dixon-Coles (correção de placares baixos) — **Testado e não adotado**

O ajuste de Dixon-Coles aplica um fator τ aos quatro placares baixos
(0-0, 1-0, 0-1, 1-1) do Poisson independente, com coeficiente ρ estimado
por máxima verossimilhança no treino. É a melhoria documentada mais
consistente da literatura para modelos Poisson independentes.

**Experimento (out/2026):**
- ρ por temporada oscila entre −0,105 e +0,1 **sem sinal consistente** —
  assinatura de ruído, não de parâmetro estável
- ρ da base de produção (2012–2026 até o corte): **+0,01** (praticamente zero)
- Brier na produção (339 jogos): **0,58125 sem DC → 0,58143 com DC** — piora marginal

**Decisão:** não adotar. O código (estimador `estimateDixonColesRho`,
`poissonResultProbabilities(expected, rho)`, grelha conjunta
`dcJointGrid`) permanece em `matchModel.ts` como utilidade testada
(ρ = 0 reproduz exatamente o comportamento anterior), mas a produção
segue com ρ = 0. Se uma atualização futura quiser reabrir, rodar o
mesmo experimento: estimar ρ na base vigente e comparar o Brier.


## 16. Elo dinâmico e ensemble com o Poisson — **Testado e não adotado**

Elo por clube (K=32, multiplicador de margem, mando +65) treinado
sequencialmente sobre 2012–2025, H/E/F via expectativa logística com
empate escalado pela taxa da liga. Ensemble por média com o Poisson
de produção, varrendo o peso α.

**Experimento (nov/2026), produção (339 jogos):**

| α Poisson | Brier |
|---|---|
| 1,0 (só modelo) | **0,58125** |
| 0,9 | 0,58226 |
| 0,7 | 0,58659 |
| 0,5 | 0,59402 |
| 0,3 | 0,60455 |

Monotônico: qualquer Elo dilui. Elo sozinho: 0,6485 (pior que o
Poisson 0,6318 na varredura walk-forward por temporada). O Poisson
com forças casa/fora + encolhimento já embute o que o Elo captura
(força dinâmica), com menos ruído — o Elo adiciona variação sem
informação nova.

**Decisão:** não adotar. `eloModel.ts` permanece como utilidade
testada para reabrir o experimento; produção segue 100% Poisson.


## 17. Critérios de desempate alinhados ao Art. 15 do REC 2026 — **Corrigido**

Versão anterior tinha uma mini-tabela de confronto direto para 3+
empatados — que **não existe no REC 2026**: o Art. 15 aplica confronto
direto **exclusivamente para empate entre dois clubes**.

**Ordem oficial (Art. 15, CBF):** 1) vitórias; 2) saldo; 3) gols pró;
4) confronto direto (só 2 clubes: pontos → saldo → gols pró no
confronto); 5) cartões vermelhos; 6) cartões amarelos; 7) sorteio.

**Na simulação:** pontos → vitórias → saldo → gols pró → confronto
direto (2 clubes, incluindo os simulados) → **sorteio reprodutível**.
Os itens 5 e 6 exigem cartões, ausentes dos nossos snapshots — a queda
para o item 7 é declarada. Para 3+ empatados a consequência é a mesma
do sorteio oficial na ausência de cartões: aleatória.

**Vascone**: clubes médios em Z4 disputada que ganham seus confrontos
diretos ganham menos que na versão anterior com mini-tabela — a versão
com mini-tabela era mais generosa do que o regulamento prevê.


## 18. Blend xG × gols e cartões no desempate — **Adotado**

**Contexto:** gols são a métrica mais ruidosa do futebol (~2,7/jogo; um
clube tem ~38 "eventos de gol" por temporada). O xG agrega a qualidade de
todas as chances, convergindo mais rápido para a força real. Foi a última
melhoria de grande porte candidata para o modelo (Dixon-Coles §15 e Elo
§16 já haviam falhado na medição).

**Fonte:** FBref/SofaScore/FotMob estão atrás de Cloudflare para clientes
sem navegador (403 testado em nov/2026). A API pública **365scores**
responde JSON estável, sem key, com xG por chute (`chartEvents.events[].xg`,
competitorNum 1/2) e cartões por partida (`events[].eventType.name` +
`competitorId`). Validada na adesão: **339/339 pares ordenados e placares
idênticos** aos resultados empacotados; ΣxG auditado contra Σgols
(±25%) a cada coleta. **Cartões:** a fonte tem duas visões que contam
diferente — a soma dos eventos por partida é sistematicamente ~4–6
amarelos por clube maior que a tabela agregada "Yellow Cards" (19/20
clubes), consistente com a tabela excluir cartões de banco/comissão
técnica. Adotamos a soma por partida (granular, internamente
consistente, sempre ≥ agregado) como fonte única; a tabela agregada
fica como aviso no log e como guarda inferior (a soma por jogo jamais
pode ser menor que o agregado). Parser: `scripts/lib/threesixfive.mjs`;
coleta incremental: `scripts/backfill-xg-cards.mjs`, chamado pelo updater
(falha da fonte não bloqueia o resultado — mantém snapshot anterior).

**Blend:** λ final = (1−w)·λ<sub>gols</sub> + w·λ<sub>xG</sub>, com o λ em
xG usando a MESMA mecânica de taxas por mando regularizadas (k=20), com os
"gols" das partidas 2026 substituídos pelo xG somado dos chutes. A base
longa 2012–2025 permanece só em gols (xG aberto do Brasileirão não existe
para esse período).

**Protocolo:** walk-forward POR RODADA de 2026 — treino até a rodada t−1
(gols da base longa + xG das rodadas anteriores), teste na rodada t com
Brier de resultado H/E/F; o xG da própria rodada nunca entra no treino.
Candidatos w ∈ {0, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1}.

**Resultado (corte nov/2026, 33 rodadas, 327 jogos de teste):**
Brier acumulado por peso — w=0 (só gols) 0,60789 · **w=0,15 → 0,60772
(melhor)** · 0,25 → 0,60799 · 0,33 → 0,60843 · 0,5 → 0,61003 ·
0,67 → 0,61256 · 0,75 → 0,61408 · w=1 (só xG) 0,62018. Direção
consistente: um pouco de xG melhora, muito piora — o resultado final
depende da finalização, não só da qualidade das chances. A tabela viva
peso→Brier fica na aba Metodologia & Validação (bloco "xG × gols"),
recalculada a cada coleta.

**Ressalva honesta (in-sample):** o peso é escolhido e medido nas MESMAS
rodadas de 2026 — não há temporada anterior com xG para validação fora
da amostra (limitação análoga à do §14, sem alternativa disponível). O
ganho de 0,00017 pode ser ruído; a adoção de w=0,15 é o mínimo
não-nulo, teoricamente motivado, e o modelo de gols puro permanece
disponível com w=0. **Plano de recalibração:** na temporada 2027, com
duas temporadas de xG, o peso passa a ser validado walk-forward ENTRE
temporadas (mesma política do k de produção). O peso fixo de produção
`XG_BLEND_WEIGHT` (projectionConfig.ts) NÃO é recalibrado
automaticamente; atualizações de dados podem mover o vencedor sem
invalidar a decisão original (o painel exibe o vencedor corrente).

**Cartões no desempate (itens 5/6 do Art. 15):** cartões reais da fonte +
taxa por jogo da temporada × jogos restantes = total projetado por clube
(determinístico, constante por temporada — `src/discipline.ts`). Menor
vermelho resolve primeiro; menor amarelo em seguida; ainda empatados,
sorteio reprodutível. Cartões NÃO são simulados jogo a jogo: o regulamento
usa apenas a contagem agregada para desempatar, e a taxa média do clube é
a estimativa honesta disponível. Impacto esperado pequeno: só resolve
empates de 3+ clubes idênticos em pontos, vitórias, saldo e gols pró —
vermelhos por clube (~4–6/temporada) são quase puro ruído; o ganho é de
fidelidade regulamentar (eliminar a queda direta para o sorteio do §17).

**Guardas de publicação:** pares únicos no calendário; ΣxG ≈ Σgols; cartões
conferidos com tabela agregada; sem cobertura de xG (placeholder "-" na
fonte) o jogo entra nos cartões mas sai do dataset xG; módulo
`src/advancedStats2026.ts` é GERADO — nunca editado à mão.


## 19. API Futebol BR: artilharia automática e preenchimento em segundo plano — **Adotado**

**Fonte:** API Futebol BR (api.api-futebol.com.br, Bearer key no secret
`API_FUTEBOL_BR_KEY`). Sondagem em nov/2026 (plano Premium de teste,
1.000 req/dia até 14/11; plano grátis segue com 100/dia):

- `/v1/campeonatos/10/artilharia` → goleadores da edição atual
  (**sem assistências** nos dados; endpoint dedicado de assistências não existe);
- `/v1/campeonatos/10/tabela` → classificação: **20/20 clubes, 0
  divergências** vs nossos placares na adesão (conciliação tripla com
  ESPN standings e valorfinal);
- `/v1/partidas/{id}` → gols por atleta (sem assistência) e **cartões por
  partida** (cross-check com 365scores: nas 11 primeiras partidas comuns,
  Δamarelos 4, Δvermelhos 0 — as fontes divergem em critérios de contagem;
  365scores permanece a fonte do desempate);
- **sem xG** nas estatísticas de partida; **sem rota para edições antigas**
  (404 em /edicoes, /slug/fases e /artilharia/{edicao_id}).

**Artilharia:** a lista manual (ESPN, sem metadados) foi substituída por
`src/scorers2026.ts` GERADO a cada ciclo do updater, com Σgols de atletas
≈ gols pró da tabela menos gols contra (872 vs 906 na adesão; pequenas
diferenças por clube são gol contra e arredondamentos da fonte) e
conciliação da tabela como guarda. Posição por empate compartilha o
número do primeiro lugar.

**Preenchimento histórico em segundo plano (sem pressa):** cada ciclo do
updater coleta até `API_FUTEBOL_BR_PER_RUN` detalhes de partidas
encerradas ainda não cobertos (rodadas recentes primeiro), guardando o
acumulado em `data/source-snapshots/apifb-partidas-2026.json`. O
"histórico" que o projeto consegue não vem desta API (sem edições
antigas): vem do acúmulo ORGÂNICO dos snapshots anuais — 2026 vira a
primeira temporada com xG + cartões completos; com 2027, o blend do §18
ganha validação walk-forward ENTRE temporadas e o peso do xG é
recalibrado sob o mesmo protocolo do k de produção.
