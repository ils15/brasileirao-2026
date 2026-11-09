# Brasileirão 2026 — painel Série A

Dashboard responsivo em React, TypeScript e Vite. Os dados do site são locais e estáticos: não há API, atualização ao vivo nem busca de dados em runtime.

O **corte analítico** é **06/11/2026 às 21:58:14 BRT** (`2026-11-07T00:58:14Z`). O pacote foi gerado nesse mesmo instante. Corte, data/hora de evento registrada pela fonte, data prevista no calendário, captura da fonte e publicação do site são coisas diferentes; a captura individual de várias fontes e o horário de publicação não foram registrados.

## Sumário

- [Visão geral e navegação](#visao-geral)
- [Como ler os dados e projeções](#como-ler)
- [Fontes e proveniência](#fontes)
- [Pacote local e integridade](#pacote-local)
- [Atualização automática](#atualizacao)
- [Executar e verificar](#executar)
- [Publicação](#publicacao)
- [Modelo, validação e limitações](#modelo)

<a id="visao-geral"></a>
## Visão geral e navegação

O painel tem sete abas acessíveis, organizadas por assunto. A navegação principal usa `role="tablist"` e aceita teclado; âncoras antigas ainda abrem a aba correspondente.

1. **Visão Geral** — indicadores, classificação **calculada localmente** a partir do pacote, artilharia informativa e clubes por zona.
2. **Classificações** — oito vistas: geral, últimas 10 rodadas, mandante, visitante, turno (rodadas 1–19), returno (20–38), evolução por rodada e sequências/extremos.
3. **Jogos** — resultados até o corte, com filtros, ordenação e paginação; abaixo, calendário restante por clube.
4. **Confrontos** — próxima rodada pendente, gols esperados (λ) e probabilidades de V/E/D; também inclui confronto direto entre clubes.
5. **Projeções** — simulações por clube e por pontuação, em sub-abas, com intervalos e exportação.
6. **Metodologia & Validação** — backtest, ablações walk-forward, forças por clube/mando, exemplo numérico e limitações.
7. **Dados & Auditoria** — fontes, hashes quando disponíveis, validações e exportação dos dados com proveniência.

Documentação complementar: [auditoria de cálculos](docs/auditoria-calculos.md), [dicionário de dados](docs/dicionario-dados.md) e [log de atualizações](docs/atualizacoes.md).

<a id="como-ler"></a>
## Como ler os dados e projeções

### Corte, captura e data de jogo

- O corte delimita quais resultados locais entram nas análises. Ele não é a hora de captura das fontes nem a data de publicação.
- Em **Jogos**, “Data/hora na fonte” reproduz o registro original: ESPN inclui timestamp UTC; Football-Data não declara o fuso do campo `Time`. Esse campo não é uma confirmação independente do kickoff oficial.
- O calendário restante deriva da **Tabela Básica CBF**, que lista confrontos e datas planejadas por rodada; não é a programação detalhada definitiva e pode mudar.
- Exemplo documentado: a Tabela Básica CBF, referência 340, indica Chapecoense–Mirassol na rodada 34 em **04/11 ou 05/11**. O registro ESPN local traz `2026-11-03T22:30Z` (**19:30 BRT**). São referências diferentes; o pacote não contém comprovação oficial suficiente para escolher uma data de kickoff real. O placar e a data do registro não devem ser reescritos como confirmação oficial.

### Classificação e artilharia

- A classificação exibida é derivada localmente dos resultados empacotados, não uma classificação CBF oficial no corte. Há reconciliação interna do pacote, mas não conferência independente atual da classificação; a ordem também não aplica integralmente o Art. 15 do REC.
- A artilharia do painel inclui os **305 atletas** do snapshot da API Futebol BR, paginados em 20 por página (16 páginas; última com 5). O snapshot foi capturado em `2026-11-07T16:00:24.137Z`, depois do corte. Não há timestamp por partida para verificar cobertura temporal, então a lista é informativa e **não representa a artilharia no corte**; não foi confirmada como cobertura oficial CBF.

### Critério oficial e ordenadores analíticos

O [REC CBF da Série A 2026, Art. 15, §§1–2, PDF p. 10](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf) determina, entre clubes empatados em pontos: mais vitórias → maior saldo de gols → mais gols pró → confronto direto apenas para dois clubes (pontos somados nos jogos de ida e volta; persistindo, saldo desses jogos) → menos cartões vermelhos → menos cartões amarelos → sorteio. Para grupos de três ou mais, o §2 exclui o confronto direto e a sequência segue para os critérios disciplinares.

Isso é distinto das ordenações locais. A classificação derivada mostrada no painel usa pontos → vitórias → saldo → gols pró → nome do clube; não aplica H2H, disciplina ou sorteio. A tabela simulada também não é uma classificação oficial: para dois clubes, usa H2H por pontos → saldo → gols pró (passo adicional não previsto pelo Art. 15) e sorteio, sem cartões; para grupos de três ou mais, pula H2H e usa disciplina estimada (menos vermelhos → menos amarelos), depois sorteio reprodutível. Detalhes e limites estão em [§17 da auditoria](docs/auditoria-calculos.md#17-art-15-do-rec-2026-e-comparadores-locais).

Os dados de cartões usados no comparador vêm de snapshots posteriores ao corte. A captura 365scores (`2026-11-07T15:25:20.960Z`) e a da API Futebol BR (`2026-11-07T16:02:11.037Z`) não trazem timestamps por partida suficientes para certificar o estado histórico. Não apresentar contagens atuais ou estimativas como cartões oficiais do corte.

### Projeções

- As 500.000 simulações estimam resultados condicionados aos dados e ao modelo deste pacote, com semente fixa `20261104`. As probabilidades são frequências simuladas, não odds nem recomendação de apostas.
- **Por clube:** as zonas mostram a frequência de cada destino nas simulações; IC 95% Wilson expressa incerteza da estimativa Monte Carlo. Mediana e P25–P75 descrevem pontos finais típicos; P90 é um percentil alto. Δ compara a mediana aos pontos no corte.
- **Por pontuação:** a curva mostra a chance de cada destino condicionada a terminar com aquela pontuação. Categorias sem ocorrência (`K=0`) não são estimadas. O IC trata cada tabela simulada como cluster.
- O IC não cobre toda a incerteza de fontes e modelo. As vagas são condicionais às faixas usadas; títulos de Copa do Brasil e torneios CONMEBOL e redistribuições não são simulados.

<a id="fontes"></a>
## Fontes e proveniência

| Fonte e uso | Referência temporal / captura | Cobertura | Status e limites |
|---|---|---|---|
| [Football-Data](https://www.football-data.co.uk/new/BR.csv) + [ESPN scoreboard](https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard) — resultados 2026 | Corte analítico: 06/11/2026 21:58:14 BRT. Captura individual do CSV e dos scoreboards não registrada; há arquivos ESPN datados de 03–07/11 UTC. Pacote gerado em 07/11 00:58:14.422Z. | 339 resultados locais: 331 atribuídos a Football-Data e 8 a ESPN. | Fontes secundárias; placares não foram conferidos linha a linha contra a CBF. Football-Data não informa fuso; ESPN registra UTC. |
| [CBF — Tabela Básica 2026](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_BA_sica_Brasileiro_SA_rie_A_2026_d64996b4d8.pdf) — calendário de confrontos | Edição emitida em 15/12/2025; captura individual não registrada. Para a ref. 340, indica 04/11 ou 05/11. | 380 referências de jogos; datas por rodada, sem programação detalhada de horários. | Fonte oficial de programação básica; o próprio documento diz que a programação não é definitiva e pode mudar. Não confirma o resultado nem a data real de um evento. |
| [CBF — página de classificação](https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026) e HTML local arquivado | Consulta da página atual em 08/11/2026 exibiu “08/11/2026 - 12:52”; fuso e semântica não declarados. O HTML arquivado exibe “04/11/2026 - 19:41”, também sem fuso/semântica; captura individual não registrada. | O HTML arquivado soma 332 jogos. | A página consultada é pós-corte; o HTML não concilia com os 339 resultados locais. Nenhum dos dois comprova a classificação histórica no corte nem verifica placares individuais. |
| 365scores — xG por chute e cartões | Snapshot obtido em `2026-11-07T15:25:20.960Z`, após o corte. Sem timestamp temporal por partida suficiente. | Registros de xG/cartões correspondem em pares e placares a jogos do pacote; isso não prova disponibilidade no corte nem completude. | Dados pós-corte não validam retrospectivamente o corte nem desempate oficial. Não preencher lacunas com zero. SHA informado é do JSON canônico, não do snapshot bruto. |
| API Futebol BR — artilharia | Snapshot capturado em `2026-11-07T16:00:24.137Z`, após o corte; sem timestamp por partida. | 305 registros de atletas. | Cobertura temporal por partida e cobertura oficial CBF não confirmadas. Não representa a artilharia no corte. SHA é do JSON canônico normalizado, não do snapshot bruto. |
| Football-Data — histórico 2012–2025 | Origem/data de aquisição do CSV histórico não estabelecida independentemente. Mtime local do pacote: `2026-11-04T10:52:14-03:00` (não é captura/publicação). | 5.319 partidas em 14 temporadas. | Tabelas finais CBF verificadas agregadamente apenas para 2021–2025; 2012–2020 sem verificação independente. |
| [OpenFootball — fork `jackdepaula/br-brazil`](https://github.com/jackdepaula/br-brazil/tree/1aae6a91b196f7c55224cd47ee4a31431d45fe3a) — retrospecto 2003–2011 | Snapshot do commit fixado `1aae6a91b196f7c55224cd47ee4a31431d45fe3a`; licença CC0 1.0, cópia em `data/source-snapshots/openfootball-br-2003-2011/LICENSE.md`. | 3.857 placares de nove temporadas; cada ano tem uma partida datada cruzada com RSSSF. | Uso exclusivamente descritivo/H2H. Não há tabelas finais publicadas pelo app; exceções 2004/2005 e regras de parsing estão em [`docs/historico-2003-2011.md`](docs/historico-2003-2011.md). |
| [Wikipédia em inglês](https://en.wikipedia.org/) — camada de corroboração 2003–2011 | Sidecar imutável em `data/corroboration/wikipedia/`, por temporada, com `oldid` fixado (`PINNED_REVISIONS`) e `retrieved_at` em UTC; texto completo da licença no próprio diretório. | 5 temporadas com matriz casa/fora extraída (2006, 2007, 2009, 2010, 2011); 2004, 2005 e 2008 não têm matriz na revisão fixada; 2003 está fora do cross-check por `{{citation needed}}`. | **CC BY-SA 4.0**. Camada de corroboração secundária, **não consumida pelo runtime**: não alimenta `src/historicalSeasons.ts`, treino, projeção, calibração ou backtest. Divergências ficam abertas em `reports/conflicts.json`; a fonte canônica continua sendo o OpenFootball (CC0). |

## Dados pós-corte não são retrato histórico

O modelo usa dados locais e fixos. O snapshot de xG/cartões e a lista de artilharia foram capturados depois do corte; sem timestamp por partida não é possível afirmar que cada valor estava disponível no corte. A correspondência de pares/placares não resolve essa limitação temporal. Esses dados não validam fatos históricos, a tabela local ou critérios oficiais, e lacunas não devem ser tratadas como zero.

<a id="pacote-local"></a>
## Pacote local e integridade

O pacote atual reúne **339 resultados** (331 Football-Data, 8 ESPN), 20 clubes e **41 jogos pendentes**, conciliados internamente com 380 pares únicos da Tabela Básica CBF. O CSV local contém 338 linhas de 2026 com placar; pares sobrepostos com ESPN conservam uma atribuição por jogo. O timestamp do último kickoff incluído, `2026-11-06T23:00:00Z`, é anterior ao corte (`2026-11-07T00:58:14Z`) em cerca de 1h58; esse horário descreve o evento, não a captura das estatísticas. O snapshot 365scores de xG/cartões foi capturado em `2026-11-07T15:25:20.960Z`, após o corte, e não há timestamp por partida; portanto, não comprova que o xG de qualquer evento estivesse disponível ou observado no corte. ESPN usa instante explícito com fuso; para Football-Data, o corte conservador exclui datas iguais ou posteriores ao dia UTC do corte, pois o fuso de `Time` não é declarado. Registros com kickoff idêntico entram ou saem em bloco.

Os totais dos 20 clubes fecham internamente em pontos, jogos, vitórias, empates, derrotas e gols pró/contra; isso não substitui validação independente da classificação contra a CBF. O HTML CBF arquivado soma 332 jogos e não valida os 339 resultados do pacote.

Hashes conferidos contra artefatos locais: CSV Football-Data `8c901ae50d8633252522786c759f3cf9d41365ac4c0bab21df9edc408d9b56b4`; scoreboards ESPN (cinco arquivos, nomes em ordem, conteúdo unido por `|`) `0a556ba4ffdcaf19ab5af9e208396a18be4bb15ba215831ca941f18204bfd658`; HTML CBF `16b1c022581db4a1b1e0f323e8543b82f9178887c13c5151797f0bab45581819`; tabela básica CBF PDF `5fc7bccb00eabba0f60ba112e0fe36e8290230ab4883a06faea7c0d14629bcd3`; JSON canônico 365scores `4b50ef2ed0815af05dbd8ddb3edef1027d75e5121654234bf301ad673320b468`; JSON canônico API Futebol BR `d6f65e6dbec40f2fafd97fa5d3165fdbf9905e54e3c6c68c9d8b24f501bafae3`.

O módulo `src/historicalSeasons.ts`, gerado por `scripts/pack-history.mjs`, reúne 9.176 partidas de 2003–2025: 3.857 placares OpenFootball (2003–2011), descritivos apenas, e 5.319 jogos Football-Data (2012–2025), único histórico usado no modelo. Os jogos Football-Data mantêm data/hora do CSV e ordinal original; 2016 tem 379 jogos porque Chapecoense × Atlético-MG de 11/12/2016 consta sem placar (partida não disputada após a tragédia com o voo LaMia). Os cortes ordenam cronologicamente e não dividem kickoffs idênticos; o conjunto de teste pode ter 79, 80 ou 82 jogos. A cópia bruta de Football-Data e os snapshots OpenFootball permanecem em `data/source-snapshots/`, fora dos ativos de runtime.

<a id="atualizacao"></a>
## Atualização automática pós-rodada

O site é um snapshot estático regenerado por pipeline. Quando há jogos, o workflow agendado (`update-data.yml`, a cada duas horas) coleta o CSV Football-Data e scoreboards ESPN desde o último corte, só aceita resultados conciliáveis com o calendário CBF de 380 jogos (par ordenado único; disputados + pendentes = 380), regenera módulos, roda a suíte completa e faz commit; depois o workflow publica o build. Sem dados novos conciliáveis, a execução é um no-op verde. A suíte usa invariantes derivados dos dados, não contagens literais. Datas do log automático são dias UTC de processamento, não datas de kickoff, captura ou publicação. Captura individual e horário de publicação não são registrados no pacote. Histórico em [docs/atualizacoes.md](docs/atualizacoes.md).

<a id="executar"></a>
## Executar e verificar

```sh
npm ci
npm run dev
npm test
npm run build
```

As 500.000 simulações usam Web Worker e semente fixa `20261104`.

<a id="publicacao"></a>
## Publicação no GitHub Pages

O destino previsto é o project site público `https://ils15.github.io/brasileirao-2026/`. No repositório, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**. O workflow valida pushes e pull requests e publica somente em push para `main`; execução manual valida sem publicar. `npm run dev` e `npm run build` usam a raiz `/`; para reproduzir o build publicado localmente, execute `GITHUB_PAGES=true npm run build` e `npm run smoke:pages`.

### Hooks locais de commit (opt-in)

Para ativar os hooks neste repositório, execute explicitamente `node scripts/install-hooks.mjs`. A configuração é somente local (`core.hooksPath=.githooks`); o instalador não altera a configuração global e não é executado por `npm install`. É necessário ter Node.js/npm e as dependências já disponíveis localmente. Se elas estiverem ausentes, o hook falha com uma mensagem; nenhum pacote é instalado nem a rede é acessada automaticamente.

O `pre-commit` executa `npm test`, `GITHUB_PAGES=true npm run build` e `git diff --cached --check`; qualquer falha bloqueia o commit. O `commit-msg` rejeita assunto vazio ou só com whitespace e whitespace no fim de qualquer linha, sem exigir prefixo ou formato específico. Esses hooks locais complementam — não substituem — o workflow de CI, que valida testes, build para Pages e smoke test em pull requests; a publicação continua condicionada a push para `main`.

Para desativar os hooks neste repositório, remova somente a configuração local com `git config --local --unset core.hooksPath`. Isso não apaga os arquivos versionados em `.githooks` nem altera configurações globais.

<a id="modelo"></a>
## Modelo de gols e simulação

O modelo de produção usa taxas por clube e mando, encolhidas para um prior histórico de mando. Seja `v` casa/fora:

```text
taxa_c,v = (gols 2026_c,v + k × taxa histórica ponderada_c,v) / (jogos 2026_c,v + k)
λ casa = μ casa × (ataque mandante,casa / μ casa) × (gols sofridos visitante,fora / μ casa)
λ fora = μ fora × (ataque visitante,fora / μ fora) × (gols sofridos mandante,casa / μ fora)
```

As taxas históricas usam apenas Football-Data 2012–2025 (5.319 partidas); os placares OpenFootball 2003–2011 são excluídos de treino, projeções, calibração, seleção de k e backtests. A ponderação por recência usa meia-vida de 2,5 temporadas e regularização para a média da liga com 20 jogos ponderados prévios. `k=20` para a produção segue a política walk-forward: é o k selecionado para a temporada 2025 usando apenas os anos anteriores, entre `{0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30}` pelo Brier da variante casa/fora (antes da auditoria, o k era escolhido in-sample — ver `docs/auditoria-calculos.md`); não há validação externa independente desse k. A μ exibida como base de treino cobre histórico modelável + jogos de 2026 até o corte (o histórico puro é referência editorial). Gols são amostrados de Poisson independentes.

### Blend xG × gols e disciplina estimada na projeção

O λ de produção mistura o modelo em gols com um segundo modelo estimado em **xG** da temporada 2026 (xG somado por chute, fonte 365scores): `λ = (1−w)·λ_gols + w·λ_xG`. O peso `w` foi fixado no vencedor do walk-forward **por rodada** de 2026 (treino até t−1, Brier de resultado em t) e vive em `src/projectionConfig.ts` (`XG_BLEND_WEIGHT`); a tabela viva peso→Brier está na aba Metodologia e o protocolo no §18 da auditoria. Importante: o snapshot de xG foi capturado após o corte (`2026-11-07T15:25:20.960Z`) e não há timestamp por partida que prove disponibilidade histórica; portanto, o xG usado no painel não é evidência do que se conhecia no corte. Na simulação final, apenas grupos de três ou mais clubes empatados nos quatro critérios gerais usam os cartões do snapshot mais taxa por jogo projetada para jogos restantes (`src/discipline.ts`), como detalhado acima. São estimativas locais pós-corte; não comprovam o desempate oficial no corte. Cartões não são simulados jogo a jogo.

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

Os resultados são mistos: nem as forças casa/fora nem H2H melhoram consistentemente o baseline. H2H tem peso zero na previsão de gols e nas probabilidades de V/E/D de 2026; no calendário, os cards por mando do clube agregam todo o histórico disponível de 2003–2025 (OpenFootball 2003–2011 + Football-Data 2012–2025), e o retrospecto H2H exibe os placares de 2003–2025 e 2026, com N, V-E-D e pontos por mando para o mandante do próximo jogo. O recorte 2003–2011 é OpenFootball descritivo, nunca previsão ou entrada de modelo. No desempate da tabela simulada, dois clubes usam os resultados H2H de 2026 retidos no pacote e os placares futuros simulados; grupos de três ou mais usam disciplina estimada a partir do snapshot pós-corte. Os placares não foram conferidos individualmente contra a CBF, e a cobertura temporal de cartões não é verificável. Isso não comprova aplicação oficial integral do REC; empate ainda não resolvido usa sorteio reprodutível.

## Curva de pontuação, vagas e limitações

A curva é condicionada à pontuação final exata: `K/N` é clubes-simulações que caíram na categoria dividido pelo total de clubes-simulações naquela pontuação. O IC 95% considera cada tabela simulada como cluster, não 20 observações independentes; “amostra baixa” marca intervalos com largura ≥10 pontos percentuais. Categorias com K=0 são omitidas como não estimáveis. No cenário G-6* do painel, os grupos são por posição: campeão (1º), Libertadores (2º–6º), Sul-Americana (7º–12º) e meio de tabela (13º–16º); rebaixamento continua 17º–20º.

As 5.000 simulações de tabela por temporada avaliam grupos finais históricos pelas faixas de posição da época: 1º campeão; 2º–6º Libertadores; 7º–12º Sul-Americana; 13º–16º meio; 17º–20º rebaixamento. Para 2026, este painel mantém o cenário G-6*: 1º–4º Libertadores direta, 5º preliminar, 6º assumido no cenário e os seis clubes seguintes fora da Libertadores (7º–12º) na Sul-Americana, conforme Art. 7 do REC CBF 2026. A redistribuição depende das regras aplicáveis e da sobreposição de classificados; a ida do Palmeiras à final da Copa do Brasil, isoladamente, não conclui que o 6º lugar receba vaga. Resultados de copas e redistribuições não são simulados.

Na classificação derivada local, a ordenação é analítica (pontos → vitórias → saldo → gols pró → nome do clube), não a ordem oficial CBF no corte. Na tabela simulada, empates entre dois clubes usam confronto direto (pontos, saldo e gols marcados) sobre jogos de 2026 no corte e resultados simulados; grupos de três ou mais usam cartões estimados pelo snapshot 365scores pós-corte e, persistindo empate, sorteio reprodutível. Os placares são rastreáveis aos snapshots Football-Data/ESPN, mas não foram conferidos linha a linha contra a CBF; cartões não têm timestamp por partida suficiente para validar seu estado no corte. O H2H não altera probabilidades de gols nem de V/E/D. As projeções não são odds nem recomendação de apostas; a variação Monte Carlo não representa toda a incerteza dos dados e do modelo.
