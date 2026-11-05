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
