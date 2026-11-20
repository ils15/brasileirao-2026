# Dicionário de Dados e Nomenclaturas — Painel Brasileirão 2026

Glossário padronizado usado em **todas** as telas, tabelas, exportações e
documentos. Termos ambíguos ("valor", "total") foram substituídos por rótulos
com fórmula explícita e base amostral declarada.

## Classificação e temporada

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Pontos (corridos)** | Σ 3×vitórias + 1×empates do clube até o corte | Classificação, KPIs, clubes, exportações |
| **Jogos Disputados** | Partidas com placar até o corte analítico | KPIs, validações |
| **Jogos Restantes** | Partidas da tabela básica CBF sem placar | KPIs, calendário, exportações |
| **Saldo de Gols** | Gols Pró − Gols Contra | Metodologia, critérios de desempate |
| **Aproveitamento (%)** | Pontos ÷ (3 × Jogos Disputados) | Estatísticas por mando |
| **Corte Analítico** | Instante UTC de referência do pacote (com equivalente local BRT); aplica-se por kickoff explícito ESPN e, conservadoramente, por data para Football-Data sem fuso. Não é captura, geração ou publicação | Todas as telas (badge snapshot), exportações (bloco de proveniência) |
| **Libertadores (zona)** | Posições 1º–`libertadoresTo`, com 1º–`directTo` direto à fase de grupos e `directTo+1`–`libertadoresTo` na 2ª fase preliminar. As fronteiras vêm do cenário ativo (`resolveLibertadoresZones`), não de um G-6 fixo: vão de G-5 (linha 5, 1º–4º direto) a G-9 (linha 9, 1º–6º direto). A linha depende das regras e da sobreposição de classificados, não apenas da ida do Palmeiras à final da Copa do Brasil | Legenda, filtros, projeções, curvas, simulador |
| **Sul-Americana (zona)** | Posições `libertadoresTo+1`–`libertadoresTo+6` — 6º–11º no G-5, 7º–12º no G-6, 10º–15º no G-9. Art. 7 do REC CBF 2026 destina as seis vagas aos clubes seguintes que não estejam na Libertadores | Legenda, filtros, projeções, curvas, simulador |
| **Meio de tabela** | Posições `sudamericanaTo+1`–16º — 12º–16º no G-5, 13º–16º no G-6 e somente o 16º no G-9 | Legenda, filtros, projeções |
| **Zona de Rebaixamento** | Posições 17º–20º, fixas em qualquer cenário (a Sul-Americana nunca invade o rebaixamento) | Legenda, filtros, projeções, simulador |
| **Desempate oficial (Art. 15, §§1–2, REC 2026)** | [Regra CBF (PDF p. 10)](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_SA_rie_A_2026_v15_12_2025_final_02692c1077.pdf): pontos → mais vitórias → maior saldo → mais gols pró → H2H somente entre dois clubes (pontos dos jogos de ida/volta; persistindo, saldo desses jogos) → menos vermelhos → menos amarelos → sorteio. Para 3+ clubes, §2 exclui H2H e a ordem segue para disciplina. | Auditoria §17 |
| **Classificação derivada localmente** | Ordenação analítica por pontos → vitórias → saldo → gols pró → nome do clube. Não aplica H2H, cartões ou sorteio e não representa classificação CBF oficial no corte. | Visão Geral · Classificações · Auditoria §17 |
| **Desempate analítico da tabela simulada** | Quatro critérios gerais (pontos → vitórias → saldo → gols pró). Para 2 clubes, H2H por pontos → saldo → gols pró (passo adicional não previsto pelo Art. 15) e sorteio sem cartões; para 3+, pula H2H, usa cartões estimados (menos vermelhos → menos amarelos) e sorteio reprodutível. Não é aplicação oficial do Art. 15; cartões vêm de capturas pós-corte sem timestamp por partida suficiente para certificar o estado histórico (Auditoria §17, §20). | Projeções · Auditoria §17–18, §20 |

## Cenários de vagas continentais (G-5 a G-9)

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Devolvido (vaga)** | A vaga voltou à tabela do Brasileirão porque o detentor já estava classificado pela tabela **ou** foi rebaixado. Não significa que o clube abriu mão da vaga: o tipo é preservado — Copa do Brasil (campeão e vice) devolve vaga preliminar; Libertadores e Sul-Americana (campeões) devolvem vaga direta | Seletor de cenário, Metodologia, Auditoria §3 |
| **`LibertadoresScenario`** | Quatro flags booleanas — `copaDoBrasilCampeaoDevolvido`, `copaDoBrasilViceDevolvido`, `libertadoresCampeaoDevolvido`, `sudamericanaCampeaoDevolvido` — que dizem quais vagas voltaram à tabela | Seletor da aba Projeções, `runProjection` |
| **`LibertadoresScenarioKey`** | Bitmask 0–15: bit 1 = campeão da Copa do Brasil, 2 = vice, 4 = campeão da Libertadores, 8 = campeão da Sul-Americana. `scenarioKeyOf` converte; `scenarioFromKey` reconstrói e rejeita chaves fora de 0–15 | `ClubProbability.lineCounts` |
| **`LibertadoresZones`** | Fronteiras resolvidas por `resolveLibertadoresZones`: `directTo` (última vaga direta), `libertadoresTo` (linha, 5–9), `sudamericanaFrom` e `sudamericanaTo` | Legendas, classificação, projeções, simulador |
| **`LibertadoresScenarioCount`** | Contagem bruta de uma combinação: `scenarioKey`, `libertadoresTo`, `directTo`, `libertadores` (classificados no total) e `direct` (classificados direto à fase de grupos) | `ClubProbability.lineCounts` |

## Análises por rodada

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Rodada nominal** | Número 1–38 impresso na tabela básica CBF (ref. única por par ordenado); a rodada 33 tem 9 jogos e a 34 tem 11 no calendário oficial | Aba Jogos, exportações |
| **Últimas 10 rodadas** | Classificação agregada apenas das 10 rodadas completas mais recentes | Aba Classificações |
| **Turno / Returno** | Agregados das rodadas 1–19 e 20–38 | Aba Classificações |
| **Evolução por rodada** | Posição cumulativa do clube após cada rodada com jogos (adiados deixam rodadas parciais; o último ponto coincide com a classificação/tabela derivada localmente do pacote de resultados até o corte, não com classificação oficial CBF validada no corte) | Aba Classificações (gráfico) |
| **Sequência vigente** | Corrente de vitórias/empates/derrotas nos resultados em ordem cronológica; “invicto” = vitórias+empates seguidos, “sem vitória” = empates+derrotas seguidos | Aba Classificações |
| **Melhor ataque / defesa** | Maior gols marcados ÷ jogos; menor gols sofridos ÷ jogos, entre os disputados | Aba Classificações |
| **Próxima rodada pendente** | Menor rodada nominal com jogos pendentes (adiados aparecem como "Rodada N (adiado)") | Aba Confrontos |

## Confrontos e probabilidades por partida

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **λ (gols esperados)** | Média de gols do modelo para um confronto; λ = μ × (ataque mandante/μ) × (defesa visitante/μ) com taxas regulares por mando; quando ativo, λ = (1−w)·λ<sub>gols</sub> + w·λ<sub>xG</sub> (blend §18) | Aba Confrontos, Metodologia |
| **xG (gols esperados do jogo)** | Soma do valor xG de cada chute do clube na partida (fonte 365scores); alimenta o blend de gols. Não é dado disciplinar. A captura foi pós-corte e não tem timestamp por partida suficiente para certificar disponibilidade histórica | Metodologia, Auditoria §18 |
| **Força por clube/mando** | Taxas de ataque e defesa (gols/jogo) regularizadas para a média da liga; a mesma tabela alimenta os 48 confrontos da simulação | Aba Metodologia & Validação |
| **Probabilidade de resultado** | Marginais H/E/F de duas Poisson independentes com os λ do confronto; barras somam 100% | Aba Confrontos |
| **Retrospecto direto** | Barra V-E-D + timeline dos encontros 2003–2026 disponíveis; 2003–2011 é OpenFootball (CC0), 2012–2025 Football-Data e 2026 fontes atuais. Histórico, nunca altera probabilidades | Aba Confrontos |

## Projeções (Monte Carlo)

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Probabilidade de Título** | Nº de simulações em que o clube termina 1º ÷ n, com n = 500.000; semente fixa 20261104 | Tabela de projeções, exportações |
| **Probabilidade de Libertadores** | Nº de simulações em posições 1º–`libertadoresTo` ÷ n; inclui o campeão. Depende do cenário ativo (G-5 a G-9) | Tabela de projeções |
| **Probabilidade de Libertadores (grupos)** | Nº de simulações em posições 1º–`directTo` ÷ n (`ClubProbability.libertadoresDirect`), sem as vagas preliminares | Coluna "Libertadores (grupos)" da tabela de projeções |
| **Probabilidade de Sul-Americana** | Nº de simulações em posições `libertadoresTo+1`–`libertadoresTo+6` ÷ n | Tabela de projeções |
| **Probabilidade de Rebaixamento** | Nº de simulações em posições 17º–20º ÷ n; a faixa não muda com o cenário | Tabela de projeções |
| **IC 95%** | Wilson para probabilidades por clube (n efetivo = simulações); na curva P(resultado\|pontuação), cluster-robusto por simulação, com os sucessos 1º e 2º–`libertadoresTo` agregados por cluster para a Libertadores inclusiva | Tabela de projeções, curva P(resultado\|pontos), exportações |
| **Mediana de Pontos Finais** | Percentil 50 (nearest-rank) da distribuição de pontos finais do clube nas n simulações | Tabela de projeções, exportações |
| **P10 / P25 / P75 / P90** | Percentis nearest-rank (⌈p/100·n⌉-ésimo menor valor) dos pontos finais | Tabela de projeções, exportações |
| **Desvio-Padrão de Pontos Finais** | Desvio populacional (÷ n) dos pontos finais | Exportações de projeções |
| **Δ Mediana (badge)** | Mediana de pontos finais − pontos no corte; exibido em pontos absolutos e percentual sobre os pontos atuais | Tabela de projeções |
| **K/N** | Contagens exatas: K = clubes-simulações na célula; N = total da categoria/pontuação | Distribuições e curvas |
| **P(pontuação exata \| resultado)** | Distribuição de pontuação final dentro de categorias exclusivas do cenário ativo (Campeão; Libertadores 2º–`libertadoresTo`; Sul-Americana `libertadoresTo+1`–`sudamericanaTo`; Meio `sudamericanaTo+1`–16º; Rebaixamento 17º–20º) | Aba Projeções |
| **P(resultado \| pontuação exata)** | Curva condicional inversa com IC 95% cluster-robusto (cada simulação é um cluster); usa as zonas do cenário ativo, não um G-6 fixo | Aba Projeções |
| **`ClubProbability.libertadoresDirectInterval`** | IC 95% de Wilson da classificação direta à fase de grupos, no cenário ativo | Coluna "Libertadores (grupos)" (IC exibido na célula quando 0 < p < 1) |
| **`ClubProbability.lineCounts`** | 16 contagens brutas por clube (uma por `LibertadoresScenarioKey`, índice === chave), com `libertadores` e `direct`; derivadas do mesmo histograma de posições. Invariante: a soma entre clubes é n × linha (ou n × `directTo`) daquela chave | Objeto `ProjectionResult`; base para comparar linhas na mesma amostra |
| **`ProjectionResult.scenario`** | Cenário efetivo da projeção. Sem `scenario` em `runProjection`, assume o legado G-6 (`LEGACY_LIBERTADORES_SCENARIO`) | Objeto de resultado, nota "Cenário ativo" |
| **`ProjectionResult.libertadoresZones`** | Zonas resolvidas do cenário efetivo (`directTo`, `libertadoresTo`, `sudamericanaFrom`, `sudamericanaTo`), consumidas por legendas, classificação, projeções e simulador | Objeto de resultado |
| **Amostra baixa** | Célula da curva cujo IC 95% tem largura ≥ 0,10 | Aba Projeções |
| **Brier H/E/F** | Σ (pᵢ − 1[i=real])² por partida, médio por temporada; menor é melhor | Backtest, ablação |
| **k (encolhimento)** | Jogos de peso prévio na regularização das taxas de ataque/defesa; produção usa k=20 escolhido por walk-forward (temporada 2025, apenas anos anteriores) | Metodologia |
| **μ casa/fora (base de treino)** | Média por mando sobre os jogos elegíveis de 2012–2025 mais os resultados elegíveis de 2026 até o corte; o histórico puro modelável é exibido como referência editorial. OpenFootball pré-2012 não entra nessa base | Metodologia |

## Dados e auditoria

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Referência da Fonte** | Linha do CSV Football-Data (`csv-line-N`) ou ID de evento ESPN | Log de resultados, exportações |
| **Proveniência (bloco de exportação)** | `fonte` (URL + SHA-256 + captura, quando registrada), `corteAnalitico` e `geradoEm` do arquivo exportado; a geração do pacote não é a publicação | Aba Dados & Auditoria |
| **Validação da temporada 2026** | `docs/atualizacoes.md` registra, a cada coleta, os resultados e pendentes do pacote, cuja soma é sempre 380 pares únicos do calendário local CBF; estatísticas por mando fecham com o agregado derivado dos resultados (pontos/V/E/D/GP/GC). A cópia HTML da classificação CBF soma 332 jogos e não valida o conjunto atual | Aba Dados & Auditoria |
| **Validação histórica** | Totais oficiais CBF de cada temporada 2021–2025 conferem com os placares empacotados (100 clubes-temporada, sem divergências). Para OpenFootball 2003–2011 há uma partida datada amostral por ano contra RSSSF; não certifica tabelas completas. Diferenças 2004/2005 estão documentadas e os placares do snapshot não são substituídos | Aba Dados & Auditoria · `docs/historico-2003-2011.md` |
| **Fronteira do modelo** | 5.319 partidas completas de 2012–2025 podem alimentar treino, projeções, calibração e backtests. As 3.857 partidas OpenFootball de 2003–2011 servem apenas ao H2H descritivo | Metodologia · `historicalSeasons.ts` |
| **Snapshot estático** | Sem API nem atualização em runtime; o instante de geração e o corte do pacote corrente ficam em `docs/atualizacoes.md` e na aba Dados & Auditoria. Captura individual das fontes e horário da publicação não foram registrados | Badge em todas as telas |

## Convenções de exibição

- **Números, pontos e percentuais** usam fonte monoespaçada com
  `font-variant-numeric: tabular-nums` (alinhamento de decimais em colunas).
- **Percentuais** com 1 casa decimal (`80,6%`); **Brier** com 3 casas (`0,618`);
  contagens com separador de milhar pt-BR (`20.000`).
- **Base amostral visível**: toda tabela de projeção declara `n` e o IC; badges
  de variação mostram sempre o valor absoluto acompanhado do percentual.
- **Tipografia**: texto corrente 16px; células de tabela 14px; cabeçalhos de
  coluna 13px; piso de 12px restrito a badges e metadados secundários.
