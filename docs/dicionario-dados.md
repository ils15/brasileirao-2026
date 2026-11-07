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
| **Corte Analítico** | Fim dos jogos coletados (BRT e UTC); kickoffs no limite ficam do lado "concluído"; registros Football-Data sem fuso do dia-limite são excluídos por conservadorismo | Todas as telas (badge snapshot), exportações (bloco de proveniência) |
| **Libertadores (zona)** | Posições 1º–5º (1º–4º direto; 5º preliminar), somente pela tabela | Legenda, filtros, projeções, curvas |
| **Sul-Americana (zona)** | Posições 6º–11º | Legenda, filtros, projeções, curvas |
| **Zona de Rebaixamento** | Posições 17º–20º | Legenda, filtros, projeções |
| **Desempate (Art. 15 REC 2026)** | Pontos → Vitórias → Saldo → Gols Pró; entre 2 clubes: confronto direto (pontos/saldo/gols pró no confronto); entre 3+: cartões vermelhos projetados → cartões amarelos projetados; empates restantes por sorteio reprodutível | Metodologia · Auditoria §17–18 |

## Análises por rodada

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Rodada nominal** | Número 1–38 impresso na tabela básica CBF (ref. única por par ordenado); a rodada 33 tem 9 jogos e a 34 tem 11 no calendário oficial | Aba Jogos, exportações |
| **Últimas 10 rodadas** | Classificação agregada apenas das 10 rodadas completas mais recentes | Aba Classificações |
| **Turno / Returno** | Agregados das rodadas 1–19 e 20–38 | Aba Classificações |
| **Evolução por rodada** | Posição cumulativa do clube após cada rodada com jogos (adiados deixam rodadas parciais; o último ponto coincide com a classificação oficial) | Aba Classificações (gráfico) |
| **Sequência vigente** | Corrente de vitórias/empates/derrotas nos resultados em ordem cronológica; “invicto” = vitórias+empates seguidos, “sem vitória” = empates+derrotas seguidos | Aba Classificações |
| **Melhor ataque / defesa** | Maior gols marcados ÷ jogos; menor gols sofridos ÷ jogos, entre os disputados | Aba Classificações |
| **Próxima rodada pendente** | Menor rodada nominal com jogos pendentes (adiados aparecem como "Rodada N (adiado)") | Aba Confrontos |

## Confrontos e probabilidades por partida

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **λ (gols esperados)** | Média de gols do modelo para um confronto; λ = μ × (ataque mandante/μ) × (defesa visitante/μ) com taxas regulares por mando; quando ativo, λ = (1−w)·λ<sub>gols</sub> + w·λ<sub>xG</sub> (blend §18) | Aba Confrontos, Metodologia |
| **xG (gols esperados do jogo)** | Soma do valor xG de cada chute do clube na partida (fonte 365scores); alimenta o blend e o desempate disciplinar | Metodologia, Auditoria §18 |
| **Força por clube/mando** | Taxas de ataque e defesa (gols/jogo) regularizadas para a média da liga; a mesma tabela alimenta os 48 confrontos da simulação | Aba Metodologia & Validação |
| **Probabilidade de resultado** | Marginais H/E/F de duas Poisson independentes com os λ do confronto; barras somam 100% | Aba Confrontos |
| **Retrospecto direto** | Barra V-E-D + timeline dos encontros 2021–2026 disponíveis; histórico, nunca altera probabilidades | Aba Confrontos |

## Projeções (Monte Carlo)

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Probabilidade de Título** | Nº de simulações em que o clube termina 1º ÷ n, com n = 20.000; semente fixa 20261104 | Tabela de projeções, exportações |
| **Probabilidade de Libertadores** | Nº de simulações em posições 1º–5º ÷ n | Tabela de projeções |
| **Probabilidade de Sul-Americana** | Nº de simulações em posições 6º–11º ÷ n | Tabela de projeções |
| **Probabilidade de Rebaixamento** | Nº de simulações em posições 17º–20º ÷ n | Tabela de projeções |
| **IC 95% (Wilson)** | Intervalo de Wilson para a proporção com n efetivo = n simulações; exibido como limite inferior–superior sob cada probabilidade | Tabela de projeções, curva P(resultado\|pontos), exportações |
| **Mediana de Pontos Finais** | Percentil 50 (nearest-rank) da distribuição de pontos finais do clube nas n simulações | Tabela de projeções, exportações |
| **P10 / P25 / P75 / P90** | Percentis nearest-rank (⌈p/100·n⌉-ésimo menor valor) dos pontos finais | Tabela de projeções, exportações |
| **Desvio-Padrão de Pontos Finais** | Desvio populacional (÷ n) dos pontos finais | Exportações de projeções |
| **Δ Mediana (badge)** | Mediana de pontos finais − pontos no corte; exibido em pontos absolutos e percentual sobre os pontos atuais | Tabela de projeções |
| **K/N** | Contagens exatas: K = clubes-simulações na célula; N = total da categoria/pontuação | Distribuições e curvas |
| **P(pontuação exata \| resultado)** | Distribuição de pontuação final dentro de categorias exclusivas (Campeão; Libertadores 2º–5º; Sul-Americana 6º–11º; Meio 12º–16º; Rebaixamento 17º–20º) | Aba Projeções |
| **P(resultado \| pontuação exata)** | Curva condicional inversa com IC 95% cluster-robusto (cada simulação é um cluster) | Aba Projeções |
| **Amostra baixa** | Célula da curva cujo IC 95% tem largura ≥ 0,10 | Aba Projeções |
| **Brier H/E/F** | Σ (pᵢ − 1[i=real])² por partida, médio por temporada; menor é melhor | Backtest, ablação |
| **k (encolhimento)** | Jogos de peso prévio na regularização das taxas de ataque/defesa; produção usa k=20 escolhido por walk-forward (temporada 2025, apenas anos anteriores) | Metodologia |
| **μ casa/fora (base de treino)** | Média de gols por mando na base efetiva (1.900 jogos históricos + 332 de 2026 até o corte); o histórico puro é exibido como referência editorial | Metodologia |

## Dados e auditoria

| Termo padronizado | Definição / fórmula | Onde aparece |
|---|---|---|
| **Referência da Fonte** | Linha do CSV Football-Data (`csv-line-N`) ou ID de evento ESPN | Log de resultados, exportações |
| **Proveniência (bloco de exportação)** | `fonte` (URL + SHA-256 + coletado em), `corteAnalitico` e `geradoEm` embutidos em todo JSON e nas planilhas/CSVs da aba de dados | Aba Dados & Auditoria |
| **Validação da temporada 2026** | 332 resultados + 48 pendentes = 380 jogos únicos do calendário CBF; estatísticas por mando fecham com o snapshot (pontos/V/E/D/GP/GC) | Aba Dados & Auditoria |
| **Validação histórica** | Totais oficiais de cada temporada 2021–2025 conferem com os placares empacotados (100 clubes-temporada, sem divergências) | Aba Dados & Auditoria |
| **Snapshot estático** | Sem API nem atualização em runtime; dados coletados em 04/11/2026 (~16:41 BRT) | Badge em todas as telas |

## Convenções de exibição

- **Números, pontos e percentuais** usam fonte monoespaçada com
  `font-variant-numeric: tabular-nums` (alinhamento de decimais em colunas).
- **Percentuais** com 1 casa decimal (`80,6%`); **Brier** com 3 casas (`0,618`);
  contagens com separador de milhar pt-BR (`20.000`).
- **Base amostral visível**: toda tabela de projeção declara `n` e o IC; badges
  de variação mostram sempre o valor absoluto acompanhado do percentual.
- **Tipografia**: texto corrente 16px; células de tabela 14px; cabeçalhos de
  coluna 13px; piso de 12px restrito a badges e metadados secundários.
