# Fixture do gate (gate-repro)

## DADOS SINTÉTICOS — não são resultados reais

Este diretório **não** contém coleta de nenhuma fonte nem reconstrução de
placares reais. Os 6 pares e os placares foram **encontrados por busca
determinística** sobre partidas **pendentes** do calendário CBF 2026 e uma
paleta fixa de placares inventados (`SCORE_PALETTE` em
`scripts/lib/gateFixture.mjs`), no formato do scoreboard da ESPN.

O `manifest.json` registra a busca: `search.winningIndex`, o número de
tentativas (uma execução do gate de 2 arquivos por candidato), a ordem do
espaço e a paleta de placares. Nenhum campo alega origem real.

## Para que serve

O updater escreve o pacote e só depois roda os testes; enquanto dois testes de UI
dependeram do conteúdo do pacote, uma rodada real deixava a suíte vermelha e nada
era commitado. Esta fixture move o pacote, **offline e determinístico**, e o
`manifest.json` fixa `baseCutoffUtc` e `targetDate`: `repro:gate` não depende
do corte vivo do pacote.

```bash
npm run fixture:gate   # regenera a fixture a partir do pacote atual
npm run repro:gate     # copia os payloads, roda o updater e restaura a árvore
```

`fixture:gate` reconfere o vencedor registrado com uma única execução do gate;
se o calendário avançou e o conjunto não existe mais, reconfere o candidato de
mesmo índice no espaço atual. Prefere uma fixture que deixe os 2 testes
vermelhos; se o gate estiver verde com o pacote movido, grava o estado
destravado. Com a fixture já no corte atual e o gate verde, a pasta fica intacta.

`repro:gate` restaura os caminhos de dados no `finally`, então os payloads daqui
nunca ficam em `data/source-snapshots/`. Nenhum arquivo de `src/**` pode importar
deste diretório (há teste vigiando).

## Arquivos

- `espn-scoreboard-<data>.json` — payload sintético; `<data>` é o dia do corte + 1.
- `expected.json` — os pares que o updater deve incorporar (`added`, `newResults`).
- `manifest.json` — sha256 de cada payload e do expected, `baseCutoffUtc` (corte
  a partir do qual a fixture foi gerada), `targetDate` (= corte + 1 dia),
  `expectedFailures` e o registro da busca; o harness recusa hash divergente.

Não edite à mão: a única forma aceita de mudar a fixture é `npm run fixture:gate`.
