# Metodologia — modelo estatístico e projeções

O modelo preditivo estima a taxa esperada de gols ($\lambda$) de cada confronto combinando médias ajustadas por mando com encolhimento bayesiano empírico e blend com Expected Goals ($xG$):

$$\text{taxa}_{c,v} = \frac{\text{gols 2026}_{c,v} + k \times \text{taxa histórica}_{c,v}}{\text{jogos 2026}_{c,v} + k}$$

$$\lambda_{\text{casa}} = \mu_{\text{casa}} \times \left(\frac{\text{ataque}_{\text{mandante, casa}}}{\mu_{\text{casa}}}\right) \times \left(\frac{\text{defesa}_{\text{visitante, fora}}}{\mu_{\text{casa}}}\right)$$

$$\lambda_{\text{fora}} = \mu_{\text{fora}} \times \left(\frac{\text{ataque}_{\text{visitante, fora}}}{\mu_{\text{fora}}}\right) \times \left(\frac{\text{defesa}_{\text{mandante, casa}}}{\mu_{\text{fora}}}\right)$$

- **Histórico no modelo**: 5.319 partidas de 2012–2025 (Football-Data). O histórico 2003–2011 (OpenFootball) é estritamente descritivo para H2H e não entra no treinamento.
- **Blend de $xG$**: $\lambda_{\text{produção}} = (1 - w) \cdot \lambda_{\text{gols}} + w \cdot \lambda_{xG}$, calibrado por walk-forward.
- **Simulações**: 500.000 iterações Monte Carlo em Web Worker paralelo com semente pseudoaleatória determinística fixa, garantindo reprodutibilidade matemática estrita.

## Constantes vigentes

Definidas em `src/projectionConfig.ts`:

| Constante | Valor |
|---|---|
| `SIMULATION_COUNT` | 500.000 |
| `SIMULATION_SEED` | 20261104 |
| `BACKTEST_SIMULATIONS` | 5.000 |
| `SHRINKAGE_MATCHES` | 20 |
| `XG_BLEND_WEIGHT` | 0.15 |
| `MC_CI_Z` | 1.96 |
| `LIBERTADORES_BASE_SLOTS` | `{ direct: 4, preliminary: 1 }` |
| `SUDAMERICANA_SLOTS` | 6 |
| `LIBERTADORES_MAX_LINE` | 9 |
| `LIBERTADORES_LINES` | `[5, 6, 7, 8, 9]` |

O servidor de desenvolvimento troca os dois orçamentos (`DEV_SIMULATION_COUNT` = 20.000 e
`DEV_BACKTEST_SIMULATIONS` = 2.000) na borda do worker (`src/projection.worker.ts`, leitura única
de `import.meta.env.DEV`). Os valores acima continuam sendo os defaults das funções e os únicos
usados no build de produção — nenhuma função de biblioteca consulta o ambiente, então os testes
seguem determinísticos.

## Vagas continentais e cenários (G-5 a G-9)

A cota brasileira é de **7 vagas continentais** — 5 diretas e 2 preliminares —, mas apenas **4 diretas + 1 preliminar** vêm da tabela do Brasileirão (`LIBERTADORES_BASE_SLOTS`), o que define a linha-base **G-5**: 1º–4º direto, 5º na pré. As outras duas são as vagas da Copa do Brasil: o campeão entra na fase de grupos e o vice na segunda fase preliminar. Os seis clubes seguintes que não estejam na Libertadores vão à Sul-Americana (`SUDAMERICANA_SLOTS`, Art. 7 do REC CBF 2026).

Quatro vagas de copa podem ser **devolvidas à tabela do Brasileirão**, cada uma empurrando a linha em uma posição e preservando o tipo da vaga:

| Fonte | Vaga original | Tipo devolvido | Efeito na linha |
|---|---|---|---|
| Campeão da Copa do Brasil | fase de grupos | preliminar | `libertadoresTo` +1; `directTo` inalterado |
| Vice da Copa do Brasil | 2ª fase preliminar | preliminar | `libertadoresTo` +1; `directTo` inalterado |
| Campeão da Libertadores | fase de grupos (vaga extra) | direta | `libertadoresTo` +1; `directTo` +1 |
| Campeão da Sul-Americana | fase de grupos (vaga extra) | direta | `libertadoresTo` +1; `directTo` +1 |

O campeão da Copa do Brasil entra na fase de grupos. Quando ele já está classificado pela tabela, o vice assume a vaga de grupos e a vaga preliminar que caberia ao vice volta à tabela — por isso a devolução do campeão é contada como preliminar, não como direta.

A devolução vale quando o detentor **já estava classificado à Libertadores pela tabela** ou **foi rebaixado** — clube da Série B não disputa competição continental (Manual de Clubes da Conmebol). O motivo não altera a conta: em qualquer dos casos a vaga volta à tabela. "Devolvido" descreve a vaga, não uma desistência do clube.

Com $p$ devoluções preliminares (campeão e vice da Copa do Brasil) e $d$ devoluções diretas (campeões da Libertadores e da Sul-Americana):

$$\text{libertadoresTo} = \min(4 + 1 + p + d,\ 9) = \min(5 + p + d,\ 9) \qquad \text{directTo} = \min(4 + d,\ \text{libertadoresTo})$$

O teto é `LIBERTADORES_MAX_LINE = 9`: 6 diretas + 3 preliminares. A linha não depende só do total — o tipo decide a divisão. **G-6 com campeão da Libertadores** tem 1º–5º direto; **G-6 com campeão da Copa do Brasil** tem 1º–4º direto (5º e 6º na pré).

O dominó é fechado: a Sul-Americana ocupa sempre `[libertadoresTo + 1, libertadoresTo + 6]`, o rebaixamento fica fixo em 17º–20º e o meio de tabela é a sobra entre os dois:

| Cenário | Diretas | Linha | Sul-Americana | Meio de tabela |
|---|---|---|---|---|
| G-5 | 1º–4º | 5º | 6º–11º | 12º–16º |
| G-6 (+CdB campeão) | 1º–4º | 6º | 7º–12º | 13º–16º |
| G-7 (+Libertadores) | 1º–5º | 7º | 8º–13º | 14º–16º |
| G-8 (+Sul-Americana) | 1º–6º | 8º | 9º–14º | 15º–16º |
| G-9 (+CdB vice) | 1º–6º | 9º | 10º–15º | 16º |

A tabela segue a progressão real do campeonato, mas há mais de uma combinação por linha: G-7 com campeão e vice da Copa do Brasil (ambas preliminares) também para no 7º, porém com 1º–4º direto. O painel expõe as quatro flags e deriva a linha; o dropdown G-5…G-9 é só um atalho para a menor chave canônica que produz aquela linha. Por isso o atalho pode cair em uma divisão direto/pré diferente da progressão acima (G-7 pelo dropdown usa campeão e vice da Copa do Brasil, 1º–4º direto); o resumo do seletor sempre exibe a divisão efetiva.

### Bitmask e acumulação em um único passe

`scenarioKeyOf` codifica as quatro devoluções em um bitmask estável (`LibertadoresScenarioKey`, 0–15), na ordem canônica: bit 1 = campeão da Copa do Brasil, bit 2 = vice, bit 4 = campeão da Libertadores, bit 8 = campeão da Sul-Americana. `scenarioFromKey` faz a volta e rejeita chaves fora de 0–15.

Cada temporada simulada produz uma tabela final; para cada clube, o código incrementa **um histograma de posições 1–20** uma única vez. Como as 16 combinações diferem apenas nos limiares de posição, `ClubProbability.lineCounts` é derivado desse mesmo histograma — sempre 16 entradas, na ordem das chaves 0–15 (`índice === scenarioKey`), com `libertadores` e `direct` brutos. Isso garante que todas as linhas venham da **mesma amostra** de 500.000 temporadas, sem repetir o Monte Carlo por combinação, e fecha o invariante:

$$\sum_{\text{clubes}} \text{lineCounts}[k].\text{libertadores} = n \times \text{libertadoresTo}(k) \qquad \sum_{\text{clubes}} \text{lineCounts}[k].\text{direct} = n \times \text{directTo}(k)$$

O cenário ativo seleciona uma dessas entradas para publicar `libertadores`/`libertadoresDirect` e seus ICs. Os agregados que classificam cada posição em uma categoria — a curva $P(\text{resultado} \mid \text{pontuação})$ e a distribuição de pontuação por resultado — são acumulados com as zonas do cenário ativo. Por isso o resultado já carrega as 16 contagens da mesma amostra, mas o painel ainda recria o worker e reexecuta o Monte Carlo ao trocar de cenário: o passe único elimina a re-simulação entre linhas, não o recálculo dos agregados dependentes do cenário.

### A linha é premissa, não resultado determinístico

A condição que autoriza a devolução é um evento sorteado pela própria simulação: depende da posição final do detentor. O Palmeiras, por exemplo, termina no G-5 em quase todas as simulações — mas não em todas. O modelo não reavalia a condição temporada a temporada; ele aplica a linha resolvida do cenário a todas as temporadas e publica a distribuição de posições condicionada a essa linha. Portanto `libertadoresTo` é uma premissa escolhida pelo usuário (G-5…G-9) e as probabilidades são condicionais ao cenário: a probabilidade de um clube é a fração de temporadas simuladas em que ele cai dentro da faixa, não uma alocação garantida.

`ZONES` permanece como baseline histórico G-6: o backtest walk-forward e os rótulos legados usam 1º–6º/7º–12º/13º–16º/17º–20º. Sem `scenario`, `runProjection` usa `LEGACY_LIBERTADORES_SCENARIO` (campeão da Copa do Brasil devolvido, G-6) para preservar resultados e testes anteriores.

## Cobertura parcial de xG/cartões

`src/advancedStats2026.ts` declara `coverage: { matches, expected, missing }`: quantos
jogos do pacote têm registro, quantos o pacote tem e quais pares ficaram sem registro.
A UI exibe `matches/expected partidas` e deriva o status do próprio módulo; quando
`matches < expected`, o rótulo é **cobertura parcial** e os pares ausentes ficam
listados em um disclosure. Cobertura parcial nunca é apresentada como completa.

- O denominador das taxas de disciplina é `matchesCovered` por clube — o número de
  registros daquele clube no snapshot 365scores, não o total de jogos do pacote
  (`src/discipline.ts`). Cartões reais só entram onde há registro; jogos restantes
  usam a taxa por jogo coberto.
- O blend de xG usa somente as partidas com xG; jogos sem registro continuam no
  modelo de gols. A publicação é monotônica: uma coleta com menos partidas que a
  anterior não substitui o módulo.

## Leitura complementar

- [Auditoria de cálculos](auditoria-calculos.md) — fórmulas duplicadas removidas, guardas e efeito nas grandezas publicadas.
- [Dicionário de dados](dicionario-dados.md)
- [Histórico da Série A 2003–2011](historico-2003-2011.md)
