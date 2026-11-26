# Log de atualizações automáticas

Cada entrada é uma execução pós-rodada do updater (`scripts/update-data.mjs`); resultados só entram se conciliarem com o calendário CBF de 380 jogos (par ordenado único, disputados + pendentes = 380) e a suíte completa passar. Execuções sem dados novos conciliáveis são no-op e não aparecem aqui. A data do título é o dia UTC de processamento (`today` no updater), não a data local do kickoff, da captura ou da publicação. O pacote atual foi gerado em `2026-11-26T09:48:10.493Z` (`2026-11-26T06:48:10-03:00`); captura individual das fontes e horário de publicação não são registrados.

## 2026-11-05 — 4 novo(s) resultado(s)

- athletico-pr 1–3 vasco (espn, 401841306)
- flamengo 3–1 gremio (espn, 401841307)
- botafogo 1–0 atletico-mg (espn, 401841305)
- sao-paulo 0–0 corinthians (espn, 401841298)

## 2026-11-06 — 2 novo(s) resultado(s)

- palmeiras 6–1 remo (football-data, csv-line-5658)
- cruzeiro 3–2 bahia (espn, 401841303)

## 2026-11-07 — 1 novo(s) resultado(s)

- vitoria 0–3 fluminense (espn, 401841302)

## 2026-11-15 — 2 novo(s) resultado(s)

- mirassol 0–0 atletico-mg (espn, 401841311) — rodada 35
- chapecoense 0–2 vasco (espn, 401841175) — rodada 21 (jogo atrasado), Arena Condá; gols de Bruno Duarte (36') e (81')

Corte do pacote: `2026-11-15T02:39:43Z` (`2026-11-14T23:39:43-03:00`); gerado em `2026-11-15T02:39:43.313Z`.
Resultados de 2026: 339 → 341; pendentes: 41 → 39 (341 disputados + 39 pendentes = 380 do calendário CBF).
Crosscheck 2026 da coleta: 20 clubes ESPN × 20 clubes valorfinal, 0 divergências em ambas as fontes.
`npm run crosscheck` (camada histórica 2003–2011, inalterada): 1.898 partidas comparadas, 9 divergências abertas (2006: 2; 2007: 6; 2009: 1) e 2 ambiguidades de identidade — todas pré-existentes, nenhum placar canônico alterado.
Fontes secundárias não recoletadas nesta execução (sem `API_FUTEBOL_BR_KEY` e com o guard de xG recusando o refresh): artilharia (captura `2026-11-07T16:00:24.137Z`) e 365scores (captura `2026-11-07T15:25:20.960Z`) ficaram **anteriores** ao novo corte. A UI agora deriva essa relação dos dados em vez de afirmar captura pós-corte.

## 2026-11-19 — 6 novo(s) resultado(s)

- coritiba 0–1 santos (espn, 401841315)
- remo 2–0 chapecoense (espn, 401841310)
- cruzeiro 2–1 palmeiras (espn, 401841314)
- flamengo 2–1 athletico-pr (espn, 401841313)
- corinthians 4–0 botafogo (espn, 401841316)
- gremio 0–0 bahia (espn, 401841312)

Corte do pacote: `2026-11-19T13:05:52Z` (`2026-11-19T10:05:52-03:00`); gerado em `2026-11-19T13:05:52.134Z`.
Resultados de 2026: 341 → 347; pendentes: 39 → 33 (347 disputados + 33 pendentes = 380 do calendário CBF; 0 adiado(s)).

## 2026-11-20 — 1 novo(s) resultado(s)

- vasco 2–1 internacional (espn, 401841308)

Corte do pacote: `2026-11-20T00:30:37Z` (`2026-11-19T21:30:37-03:00`); gerado em `2026-11-20T00:30:37.744Z`.
Resultados de 2026: 347 → 348; pendentes: 33 → 32 (348 disputados + 32 pendentes = 380 do calendário CBF; 0 adiado(s)).

## 2026-11-20 — 1 novo(s) resultado(s)

- vitoria 2–1 bragantino (football-data, csv-line-5670)

Corte do pacote: `2026-11-20T10:12:29Z` (`2026-11-20T07:12:29-03:00`); gerado em `2026-11-20T10:12:29.760Z`.
Resultados de 2026: 348 → 349; pendentes: 32 → 31 (349 disputados + 31 pendentes = 380 do calendário CBF; 0 adiado(s)).

## 2026-11-22 — 4 novo(s) resultado(s)

- sao-paulo 0–1 fluminense (football-data, csv-line-5671)
- palmeiras 1–1 flamengo (espn, 401841322)
- bahia 0–1 coritiba (espn, 401841327)
- chapecoense 1–2 cruzeiro (espn, 401841325)

Corte do pacote: `2026-11-22T12:00:54Z` (`2026-11-22T09:00:54-03:00`); gerado em `2026-11-22T12:00:54.960Z`.
Resultados de 2026: 349 → 353; pendentes: 31 → 27 (353 disputados + 27 pendentes = 380 do calendário CBF; 0 adiado(s)).

## 2026-11-24 — 6 novo(s) resultado(s)

- athletico-pr 4–2 remo (football-data, csv-line-5675)
- fluminense 1–0 mirassol (football-data, csv-line-5676)
- bragantino 1–0 vasco (football-data, csv-line-5677)
- internacional 2–5 vitoria (football-data, csv-line-5678)
- botafogo 1–1 sao-paulo (football-data, csv-line-5679)
- santos 0–2 gremio (espn, 401841320)

Corte do pacote: `2026-11-24T12:38:55Z` (`2026-11-24T09:38:55-03:00`); gerado em `2026-11-24T12:38:55.380Z`.
Resultados de 2026: 353 → 359; pendentes: 27 → 21 (359 disputados + 21 pendentes = 380 do calendário CBF; 0 adiado(s)).

## 2026-11-26 — 2 novo(s) resultado(s)

- chapecoense 3–0 palmeiras (espn, 401841335)
- atletico-mg 1–1 corinthians (espn, 401841319)

Corte do pacote: `2026-11-26T09:48:10Z` (`2026-11-26T06:48:10-03:00`); gerado em `2026-11-26T09:48:10.493Z`.
Resultados de 2026: 359 → 361; pendentes: 21 → 19 (361 disputados + 19 pendentes = 380 do calendário CBF; 0 adiado(s)).
