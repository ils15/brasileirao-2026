# Camada de corroboração secundária (Wikipédia)

Este diretório guarda o sidecar **imutável e versionado** usado apenas pelo
script offline `scripts/crosscheck-wikipedia.mjs`. Ele **não** é lido pelo
runtime, pelo `scripts/pack-history.mjs` nem por `src/historicalSeasons.ts`.

## Conteúdo

- `2003.json` … `2011.json`: uma temporada por arquivo.
- `manifest.json`: SHA-256 de cada arquivo, `oldid` e status.
- `LICENSE`: texto integral da CC BY-SA 4.0.
- `NOTICE`: atribuição, lista de artigos/revisões e modificações.

## Status por temporada

| Status | Temporadas | Significado |
|---|---|---|
| `corroborated` | 2006, 2007, 2009, 2010, 2011 | Matriz casa/fora extraída e validada. |
| `not_corroborated` | 2003 | Seção de resultados marcada com `{{citation needed}}`; fora do cross-check. |
| `corroboration_unavailable` | 2004, 2005, 2008 | A revisão fixada não tem matriz de resultados. |

## Geração

```sh
node scripts/fetch-wikipedia-corroboration.mjs
```

O script fixa cada artigo por `oldid` (`PINNED_REVISIONS`), falha se a API
devolver outra revisão e valida contagem de clubes, contagem de partidas,
ausência de autoconfronto, placares inteiros não negativos, ida e volta por
par e consistência aritmética antes de gravar. Os JSON resultantes são
commitados; regerar só é necessário ao trocar a revisão fixada.

## Consumo

```sh
node scripts/crosscheck-wikipedia.mjs
```

Gera `reports/crosscheck-2003-2011.md` e `reports/conflicts.json`. O
cross-check é offline e determinístico e valida o SHA-256 de cada arquivo
contra `manifest.json`.
