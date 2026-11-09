# Cross-check OpenFootball × Wikipédia (2003–2011)

Comparação offline e determinística entre a camada canônica (**OpenFootball, CC0**) e a
camada de **corroboração secundária** extraída da Wikipédia em inglês (**CC BY-SA 4.0**).
A camada de corroboração não é consumida pelo runtime; nenhum placar canônico é alterado.

## Política de conflito

- O valor canônico é sempre o do OpenFootball; divergência não altera `src/historicalSeasons.ts`.
- Divergências ficam com `status: "open"` em `reports/conflicts.json` e não são resolvidas por
  maioria, recência ou votação. Resolução exige evidência primária e revisão humana.
- Coincidência entre as duas fontes é corroboração secundária, não validação primária.

## Identidade de fixture

A matriz da Wikipédia não fornece datas (e fornece rodada apenas em 2007), então o pareamento
usa `(temporada, mandante, visitante)` na direção do mando. Quando o OpenFootball tem mais de
um fixture com o mesmo mandante e visitante — replays de 2005 — as entradas permanecem
separadas e o caso é reportado como identidade ambígua; não há deduplicação por par de clubes.

## Resumo

| Temporada | Status | oldid | Comparadas | Coincidências | Divergências | Só OF | Só WP | Ambíguas |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2003 | not_corroborated | 1314521303 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2004 | corroboration_unavailable | 1324706996 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2005 | corroboration_unavailable | 1381069893 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2006 | corroborated | 1359651926 | 380 | 378 | 2 | 0 | 0 | 0 |
| 2007 | corroborated | 1348483259 | 380 | 374 | 6 | 0 | 0 | 0 |
| 2008 | corroboration_unavailable | 1260520572 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2009 | corroborated | 1355029152 | 378 | 377 | 1 | 0 | 0 | 2 |
| 2010 | corroborated | 1359651869 | 380 | 380 | 0 | 0 | 0 | 0 |
| 2011 | corroborated | 1359650245 | 380 | 380 | 0 | 0 | 0 | 0 |
| **Total** | — | — | 1898 | 1889 | 9 | — | — | 2 |

## 2003 excluída do cross-check

A seção "Results" do artigo está marcada com {{citation needed|date=October 2025}}. Sem citação verificável, a matriz não pode ser apresentada como corroborada e fica fora do cross-check.

## Detalhe por temporada

### 2003 — não corroborada

- Artigo: [2003 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1314521303) — oldid `1314521303`.
- Partidas comparadas: 0. Motivo: A seção "Results" do artigo está marcada com {{citation needed|date=October 2025}}. Sem citação verificável, a matriz não pode ser apresentada como corroborada e fica fora do cross-check.

### 2004 — corroboração indisponível

- Artigo: [2004 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1324706996) — oldid `1324706996`.
- Partidas comparadas: 0. Motivo: A revisão fixada do artigo não contém matriz de resultados casa/fora; há apenas classificação final e resumo. Nenhum placar foi extraído.

### 2005 — corroboração indisponível

- Artigo: [2005 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1381069893) — oldid `1381069893`.
- Partidas comparadas: 0. Motivo: A revisão fixada do artigo não contém matriz de resultados casa/fora; há apenas resumo, classificação final e estatísticas. Nenhum placar foi extraído.

### 2006 — corroborada

- Artigo: [2006 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1359651926) — oldid `1359651926`.
- Partidas comparadas: 380
- Coincidências: 378
- Divergências: 2
- Identidade ambígua (não comparadas): 0
- Só no OpenFootball: 0
- Só na Wikipédia: 0

| Mandante | Visitante | Rodada | Data | OpenFootball | Wikipédia | oldid |
|---|---|---:|---|---|---|---|
| botafogo | santa-cruz | 27 | 2006-10-05 | OF=3–0 | WP=1–0 | 1359651926 |
| santos | santa-cruz | 38 | 2006-12-03 | OF=3–1 | WP=2–1 | 1359651926 |

### 2007 — corroborada

- Artigo: [2007 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1348483259) — oldid `1348483259`.
- Partidas comparadas: 380
- Coincidências: 374
- Divergências: 6
- Identidade ambígua (não comparadas): 0
- Só no OpenFootball: 0
- Só na Wikipédia: 0

| Mandante | Visitante | Rodada | Data | OpenFootball | Wikipédia | oldid |
|---|---|---:|---|---|---|---|
| atletico-mg | america-rn | 12 | 2007-07-18 | OF=4–1 | WP=4–2 | 1348483259 |
| botafogo | figueirense | 38 | 2007-12-02 | OF=1–1 | WP=1–0 | 1348483259 |
| flamengo | sport | 23 | 2007-09-01 | OF=1–1 | WP=1–0 | 1348483259 |
| internacional | parana | 14 | 2007-07-25 | OF=1–0 | WP=2–0 | 1348483259 |
| nautico | figueirense | 18 | 2007-08-08 | OF=4–2 | WP=4–1 | 1348483259 |
| parana | cruzeiro | 22 | 2007-08-29 | OF=2–2 | WP=1–2 | 1348483259 |

### 2008 — corroboração indisponível

- Artigo: [2008 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1260520572) — oldid `1260520572`.
- Partidas comparadas: 0. Motivo: A revisão fixada do artigo não contém matriz de resultados casa/fora; há apenas tabela de classificação e elenco. Nenhum placar foi extraído.

### 2009 — corroborada

- Artigo: [2009 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1355029152) — oldid `1355029152`.
- Partidas comparadas: 378
- Coincidências: 377
- Divergências: 1
- Identidade ambígua (não comparadas): 2
- Só no OpenFootball: 0
- Só na Wikipédia: 0

| Mandante | Visitante | Rodada | Data | OpenFootball | Wikipédia | oldid |
|---|---|---:|---|---|---|---|
| sport | coritiba | 32 | 2009-10-29 | OF=1–1 | WP=0–0 | 1355029152 |

Identidade ambígua (reportada, nunca deduplicada por par de clubes):
- OpenFootball tem 2 fixtures botafogo × flamengo; a matriz da Wikipédia não traz data/rodada suficiente para desambiguar. Candidatos: botafogo 2–2 flamengo (R12, 2009-07-19); botafogo 0–1 flamengo (R31, 2009-10-25).
- Wikipédia registra flamengo × botafogo, mas o OpenFootball só tem o mando invertido. Nenhum placar foi comparado. Candidatos: botafogo 2–2 flamengo (R12, 2009-07-19); botafogo 0–1 flamengo (R31, 2009-10-25).

### 2010 — corroborada

- Artigo: [2010 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1359651869) — oldid `1359651869`.
- Partidas comparadas: 380
- Coincidências: 380
- Divergências: 0
- Identidade ambígua (não comparadas): 0
- Só no OpenFootball: 0
- Só na Wikipédia: 0

### 2011 — corroborada

- Artigo: [2011 Campeonato Brasileiro Série A](https://en.wikipedia.org/w/index.php?oldid=1359650245) — oldid `1359650245`.
- Partidas comparadas: 380
- Coincidências: 380
- Divergências: 0
- Identidade ambígua (não comparadas): 0
- Só no OpenFootball: 0
- Só na Wikipédia: 0

## Limitações

- A Wikipédia é fonte secundária, editável e sem revisão editorial garantida; oldids fixam apenas o texto consultado.
- Não existe fonte aberta independente e licenciada para todos os placares de 2003–2011; a camada canônica continua sendo uma única fonte (OpenFootball).
- 2004, 2005 e 2008 não têm matriz de resultados na revisão fixada do artigo em inglês; nenhum placar foi inventado.
- A matriz não traz data nem estádio, então divergências de mando aparecem como identidade ambígua, não como conflito de placar.
