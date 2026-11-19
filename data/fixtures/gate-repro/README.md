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
era commitado. Esta fixture move o pacote para exatamente esse estado, **offline e
determinístico**, para que a regressão seja reproduzível:

```bash
npm run fixture:gate   # busca o candidato que deixa os 2 testes vermelhos
npm run repro:gate     # copia os payloads, roda o updater e restaura a árvore
```

`fixture:gate` reconfere o vencedor já registrado com uma única execução do
gate; só faz a busca completa quando não há vencedor registrado ou quando ele
deixou de reproduzir. Se o gate estiver verde (deadlock destravado), a pasta fica
intacta.

`repro:gate` restaura os caminhos de dados no `finally`, então os payloads daqui
nunca ficam em `data/source-snapshots/`. Nenhum arquivo de `src/**` pode importar
deste diretório (há teste vigiando).

## Arquivos

- `espn-scoreboard-<data>.json` — payload sintético; `<data>` é o dia do corte + 1.
- `expected.json` — os pares que o updater deve incorporar (`added`, `newResults`).
- `manifest.json` — sha256 de cada payload e do expected, `expectedFailures` e
  o registro da busca; o harness recusa hash divergente.

Não edite à mão: a única forma aceita de mudar a fixture é `npm run fixture:gate`.
