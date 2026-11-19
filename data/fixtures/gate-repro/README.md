# Fixture sintética do gate (gate-repro)

## DADOS SINTÉTICOS — não são resultados reais

Este diretório **não** contém coleta de nenhuma fonte. Os placares são inventados
por uma regra determinística (`homeGoals = índice % 3`, `awayGoals = (índice + 1) % 2`)
sobre partidas **pendentes** do calendário CBF 2026, no formato do scoreboard da ESPN.

## Para que serve

O updater escreve o pacote e só depois roda os testes; enquanto dois testes de UI
dependeram do conteúdo do pacote, uma rodada real deixava a suíte vermelha e nada
era commitado. Esta fixture move o pacote para exatamente esse estado, **offline e
determinístico**, para que a regressão seja reproduzível:

```bash
npm run fixture:gate   # regenera esta pasta a partir do pacote atual
npm run repro:gate     # copia os payloads, roda o updater e restaura a árvore
```

`repro:gate` restaura os caminhos de dados no `finally`, então os payloads daqui
nunca ficam em `data/source-snapshots/`. Nenhum arquivo de `src/**` pode importar
deste diretório (há teste vigiando).

## Arquivos

- `espn-scoreboard-<data>.json` — payload sintético; `<data>` é o dia do corte + 1.
- `expected.json` — os pares que o updater deve incorporar (`added`, `newResults`).
- `manifest.json` — sha256 de cada payload e do expected; o harness recusa hash divergente.

Não edite à mão: a única forma aceita de mudar a fixture é `npm run fixture:gate`.
