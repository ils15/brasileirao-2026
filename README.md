# Brasileirão 2026 — painel Série A

Dashboard responsivo em React, TypeScript e Vite. Os dados são locais e estáticos: não há API, atualização ao vivo ou busca de dados em runtime. O corte analítico é **04/11/2026 às 13:00 BRT** (`2026-11-04T16:00:00Z`); horário de corte, kickoff da partida e hora de captura das fontes são conceitos distintos.

## Navegação por abas

O painel é organizado em sete abas acessíveis (role=tablist com navegação por teclado; âncoras antigas continuam abrindo a aba correspondente), no padrão de análises separadas por tema:

1. **Visão Geral** — KPIs da temporada, classificação oficial com colunas ordenáveis, artilharia e clubes por zona.
2. **Classificações** — oito vistas em sub-abas: geral, últimas 10 rodadas, mandante, visitante, turno (1º–19º), returno (20º–38º), evolução da posição por rodada (gráfico) e sequências/extremos.
3. **Jogos** — log dos resultados até o corte (filtros por clube/fonte/período, ordenação e paginação) e calendário dos jogos restantes por clube.
4. **Confrontos** — próxima rodada pendente com λ e probabilidades de resultado por jogo (barras H/E/F) e confronto direto visual entre dois clubes selecionáveis (barra de retrospecto, timeline dos encontros, por mando).
5. **Projeções** — probabilidades Monte Carlo por clube (IC 95% Wilson, mediana/percentis, badge Δ, exportação) e as duas leituras por pontuação, em sub-abas.
6. **Metodologia & Validação** — backtest e ablação walk-forward 2021–2025, tabela de forças por clube/mando que alimenta cada λ, exemplo numérico rastreável e fórmulas/limitações.
7. **Dados & Auditoria** — proveniência das fontes (URL, SHA-256, captura), validações em execução e exportação dos dados brutos com bloco de proveniência.

Documentação complementar: [auditoria de cálculos](docs/auditoria-calculos.md), [dicionário de dados](docs/dicionario-dados.md) e [log de atualizações](docs/atualizacoes.md).

## Atualização automática pós-rodada

O site é um snapshot estático regenerado por pipeline: quando há jogos, um workflow agendado (`update-data.yml`, duas execuções diárias) coleta o CSV Football-Data e os scoreboards ESPN desde o último corte, **só publica resultados que conciliam com o calendário CBF de 380 jogos** (par ordenado único; disputados + pendentes = 380), regenera os módulos de dados, roda a suíte completa e faz commit + build + deploy no mesmo run. Sem dados novos conciliáveis, a execução é um no-op verde. A suíte de testes usa invariantes derivados dos dados (nada de contagens literais), então atualizações não quebram o CI. O histórico de cada atualização fica em `docs/atualizacoes.md`.

## Executar e verificar

```sh
npm ci
npm run dev
npm test
npm run build
```

As 20.000 simulações usam Web Worker e a semente fixa `20261104`.

## Publicação no GitHub Pages

O destino previsto é o project site público `https://ils15.github.io/brasileirao-2026/`. No repositório, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**. O workflow valida pushes e pull requests e publica somente em push para `main`; execução manual valida sem publicar. `npm run dev` e `npm run build` continuam usando a raiz `/`; para reproduzir o build publicado localmente, execute `GITHUB_PAGES=true npm run build` e `npm run smoke:pages`.

## Dados e auditoria de fontes

- [CBF — classificação 2026](https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026)
- [CBF — tabela básica de jogos 2026](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_BA_sica_Brasileiro_SA_rie_A_2026_d64996b4d8.pdf)
- [REC CBF 2026](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf)
- [Football-Data — placares](https://www.football-data.co.uk/new/BR.csv), fonte secundária para 2021–2026; a compilação pode conter erros.
- [ESPN scoreboard — 03/11/2026](https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261103), usado para completar os dois resultados ausentes no CSV.

O dataset atual contém 332 resultados (330 Football-Data + 2 ESPN), 20 clubes e 48 jogos pendentes de um calendário CBF de 380 jogos. As duas partidas ESPN, ambas antes do corte, são Chapecoense 1–2 Mirassol (`2026-11-03T22:30Z`, evento `401841304`) e Internacional 1–0 Coritiba (`2026-11-04T00:30Z`, evento `401841301`). Para o CSV, Football-Data não especifica o fuso de `Time`; suas linhas de 2026 acabam em 02/11. A guarda de corte é aplicada em runtime ao treino de produção, estatísticas e H2H 2026. ESPN usa seus kickoffs explícitos com fuso; partidas Football-Data no dia limítrofe inteiro são excluídas conservadoramente por fuso desconhecido. Registros com kickoff idêntico são mantidos/excluídos como bloco, assim como nas dobras walk-forward. A hora de captura da fonte não substitui o corte por kickoff.

Os arquivos foram capturados em **04/11/2026 por volta de 16:41 BRT**, depois do corte analítico de 13:00. O HTML CBF retido imprime `04/11/2026 - 19:41`; a página não identifica fuso nem diz se esse campo é atualização, publicação ou horário de captura. O registro anterior “19:31 BRT” não é sustentado pelo HTML arquivado e foi removido. A CBF serve à reconciliação agregada da tabela; não foi usada para verificar placares individuais nem para afirmar que os dados foram capturados às 13:00. Cópias e metadados estão em `data/source-snapshots/` e `src/currentSeasonResults.ts`. Hashes: Football-Data `ed5c0925007f9ae35f97558993e597d41807e3f1507fae9d7e555bbab5b02bcf`; ESPN `7d2563b0d6a068ba2d0f01850cd3181aaac09d3184af7af8b5b79ebd8571f72b`; tabela básica CBF PDF `5fc7bccb00eabba0f60ba112e0fe36e8290230ab4883a06faea7c0d14629bcd3`. Os 20 clubes reconciliam em pontos, jogos, vitórias, empates, derrotas e gols pró/contra; o calendário e os resultados têm paridade entre as fontes locais.

Os 1.900 jogos históricos (380 por temporada, 2021–2025) e as tabelas finais CBF correspondentes estão empacotados em `src/historicalSeasons.ts`. Cada jogo mantém data/hora como fornecida no CSV e ordinal original. Os cortes ordenam cronologicamente; todos os jogos com kickoff idêntico ficam juntos, então o conjunto de teste pode ter 80 ou 82 jogos. O mtime local associado ao pacote (`2026-11-04T10:52:14-03:00`) é metadado de arquivo, não data de publicação; a cópia bruta atualmente retida em `data/source-snapshots/football-data-BR.csv` tem captura registrada às 16:41 BRT e não entra nos ativos de runtime. A validação contra a CBF é somente agregada em 100 clubes-temporada, sem divergências nos totais; datas e placares individuais não foram comparados linha a linha.

## Modelo de gols e simulação

O modelo de produção usa taxas por clube e mando, encolhidas para um prior histórico de mando. Seja `v` casa/fora:

```text
taxa_c,v = (gols 2026_c,v + k × taxa histórica ponderada_c,v) / (jogos 2026_c,v + k)
λ casa = μ casa × (ataque mandante,casa / μ casa) × (gols sofridos visitante,fora / μ casa)
λ fora = μ fora × (ataque visitante,fora / μ fora) × (gols sofridos mandante,casa / μ fora)
```

As taxas históricas usam 2021–2025, ponderação por recência com meia-vida de 2,5 temporadas e regularização para a média da liga com 20 jogos ponderados prévios. `k=20` para a produção segue a política walk-forward: é o k selecionado para a temporada 2025 usando apenas os anos anteriores, entre `{0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30}` pelo Brier da variante casa/fora (antes da auditoria, o k era escolhido in-sample sobre as mesmas cinco temporadas — ver `docs/auditoria-calculos.md`); não há validação externa independente desse k. A μ exibida como base de treino cobre histórico + 332 jogos de 2026 até o corte (o histórico puro é referência editorial). Gols são amostrados de Poisson independentes.

### Walk-forward e ablações

O corte de cada temporada começa no limite do 300º jogo cronológico, sem dividir kickoffs empatados. Parâmetros anuais de `k` usam somente resultados de anos anteriores (2021 usa `k=12` pré-fixado). A tabela do app exibe Brier por temporada para o modelo temporal baseline e sua referência, além das categorias finais por posição. Esses resultados avaliam as respectivas políticas walk-forward; o k de produção herdado da seleção de 2025 (fora da amostra) tampouco tem validação externa independente.

A ablação de resultado H/empate/F compara os quatro recursos nos mesmos folds. Valores abaixo são Brier; menor é melhor:

| Ano | Jogos | Baseline | Casa/fora | H2H | Combinado |
|---|---:|---:|---:|---:|---:|
| 2021 | 80 | 0,591865 | 0,591335 | 0,591300 | 0,591324 |
| 2022 | 80 | 0,614128 | 0,609257 | 0,617315 | 0,612503 |
| 2023 | 80 | 0,613518 | 0,652693 | 0,624603 | 0,658781 |
| 2024 | 82 | 0,653626 | 0,648514 | 0,648141 | 0,642276 |
| 2025 | 80 | 0,586711 | 0,595553 | 0,592434 | 0,598385 |

Os resultados são mistos: nem as forças casa/fora nem H2H melhoram consistentemente o baseline. H2H tem peso zero na previsão de gols e nas probabilidades de 2026; no calendário, são exibidos os placares disponíveis de 2021–2025 e 2026, com N, V-E-D e pontos por mando para o mandante do próximo jogo. Esse retrospecto é informação histórica, não previsão. Para desempate de dois clubes, a simulação acumula os H2H concluídos de 2026 retidos nos snapshots e os placares futuros simulados; os registros não foram conferidos individualmente contra a CBF. Cartões não estão disponíveis e empates restantes seguem sorteio uniforme reprodutível, portanto não se aplica integralmente o REC.

## Curva de pontuação, vagas e limitações

A curva é condicionada à pontuação final exata: `K/N` é clubes-simulações que caíram na categoria dividido pelo total de clubes-simulações naquela pontuação. O IC 95% considera cada tabela simulada como cluster, não 20 observações independentes; “amostra baixa” marca intervalos com largura ≥10 pontos percentuais. Categorias com K=0 são omitidas como não estimáveis. Os grupos são por posição: Libertadores 1º–5º, Sul-Americana 6º–11º e outras posições 12º–20º.

As 5.000 simulações de tabela por temporada avaliam grupos finais históricos pelas faixas de posição da época: 1º campeão; 2º–6º Libertadores; 7º–12º Sul-Americana; 13º–16º meio; 17º–20º rebaixamento. Para 2026, as probabilidades consideram 1º–4º Libertadores direta, 5º preliminar, 6º–11º Sul-Americana e quatro últimos rebaixados. Campeões da Copa do Brasil e de torneios CONMEBOL, que podem redistribuir vagas, não são simulados.

O desempate usa pontos, vitórias, saldo e gols pró; para empate entre dois clubes, a simulação considera os critérios do confronto direto (pontos, saldo e gols marcados no confronto) sobre os jogos de 2026 concluídos no corte e os resultados simulados. Os placares concluídos são rastreáveis aos snapshots Football-Data/ESPN, mas não foram conferidos linha a linha contra a CBF. Cartões não estão disponíveis e o fallback para empates restantes é uniforme e reprodutível. O H2H nunca altera as probabilidades projetadas. As projeções não são odds nem recomendação de apostas; a variação Monte Carlo não representa toda a incerteza dos dados e do modelo.
