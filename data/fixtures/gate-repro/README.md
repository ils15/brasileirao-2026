# Fixture do gate (gate-repro)

## DADOS SINTÉTICOS — não são resultados reais

Este diretório **não** contém coleta de nenhuma fonte nem reconstrução de
placares reais. Os 6 pares e os placares são escolhidos de forma
**determinística** sobre partidas **pendentes** do calendário CBF 2026 e uma
paleta fixa de placares inventados (`SCORE_PALETTE` em
`scripts/lib/gateFixture.mjs`), no formato do scoreboard da ESPN.

O `manifest.json` registra `baseCutoffUtc`, `targetDate`, os sha256 de cada
arquivo e os dois `scenarios` do gate. Nenhum campo alega origem real.

## Para que serve

O updater escreve o pacote **antes** do gate. O harness `repro:gate` prova os
dois lados do contrato com comandos de gate **injetados** por `--test`, sem
depender de testes de UI (que envelheciam junto com o pacote):

- `red` — `node -e "process.exit(1)"`: exige exit 1, escrita presente, nenhum
  commit e recibo em `.pantheon/logs/` nomeando o comando;
- `green` — `node -e "process.exit(0)"`: exige exit 0, escrita presente e
  nenhum recibo.

A fixture move o pacote, **offline e determinística**, e o `manifest.json` fixa
`baseCutoffUtc` e `targetDate`: `repro:gate` não depende do corte vivo.

```bash
npm run fixture:gate   # regenera a fixture a partir do pacote atual
npm run repro:gate     # copia os payloads, roda os dois cenários e restaura a árvore
```

`fixture:gate` grava o primeiro candidato determinístico que move o pacote no
espaço de pares pendentes; o manifest registra o candidato e os cenários.
O harness roda sobre a árvore de trabalho: por isso `repro:gate` captura um
**baseline byte-a-byte** dos caminhos de dados antes de qualquer cópia e
restaura no `finally` de **cada** cenário — nunca `git checkout`. Alterações
legítimas não commitadas sobrevivem; caminho que não existia antes é removido.
Nenhum arquivo fora dos caminhos de dados é tocado, e os payloads daqui nunca
ficam em `data/source-snapshots/`. Nenhum arquivo de `src/**` pode importar
deste diretório (há teste vigiando).

## Códigos de saída do `repro:gate`

| código | significado |
|---|---|
| 0 | os dois cenários bateram e a árvore voltou ao baseline |
| 2 | a restauração divergiu do baseline (bytes ou `git status`) |
| 3 | a fixture é inválida ou não moveu o pacote |
| 4 | a restauração falhou de forma inesperada |
| 5 | um cenário não reproduziu o contrato |

## Arquivos

- `espn-scoreboard-<data>.json` — payload sintético; `<data>` é o dia do corte + 1.
- `expected.json` — os pares que o updater deve incorporar (`added`, `newResults`).
- `manifest.json` — sha256 de cada payload e do expected, `baseCutoffUtc` (corte
  a partir do qual a fixture foi gerada), `targetDate` (= corte + 1 dia),
  `scenarios` (comandos de gate injetados) e o registro do candidato; o harness
  recusa hash divergente.

Não edite à mão: a única forma aceita de mudar a fixture é `npm run fixture:gate`.
