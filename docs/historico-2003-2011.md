# Histórico descritivo do Brasileirão (2003–2011)

## Escopo e fronteira do modelo

Os nove anos adicionados são disponíveis em Confronto Direto como retrospecto e consulta histórica. Eles **não** alimentam treino, projeção, calibração, seleção de k ou backtest. `modelableHistoricalSeasons` mantém a fronteira inclusiva em 2012; o conjunto Football-Data 2012–2025 preserva seus placares, horários, ordinais e verificações existentes. Nenhuma tabela final ou classificação oficial de 2003–2011 é publicada pelo app.

| Período | Fonte | Registros | Uso |
|---|---|---:|---|
| 2003–2011 | OpenFootball, fork `jackdepaula/br-brazil` | 3.857 | Somente descritivo/H2H |
| 2012–2025 | Football-Data | 5.319 | Dados históricos modeláveis, sem alteração semântica |
| 2003–2025 | Total empacotado | 9.176 | Consulta histórica; somente 2012+ cruza para modelo |

Os snapshots ficam em `data/source-snapshots/openfootball-br-2003-2011/` e fora dos ativos de runtime. O gerador `scripts/pack-history.mjs` grava tuplas compactadas em `src/historicalSeasons.ts`, com data UTC normalizada para `T00:00` (a hora da fonte é descartada no caso OpenFootball), índice cronológico 1-based do pacote (as tuplas são ordenadas por kickoff, com desempate pela ordem de leitura da fonte), origem, URL de arquivo, blob SHA, SHA-256 e licença por temporada. Esse índice, exposto no 6º campo (`sourceOrdinal`), **não** é o ordinal da fonte: em 2003 há 206 de 552 ordinais divergentes e, em 2007, `gremio 0–2 cruzeiro` é o 51º na fonte e o 52º no pacote.

## Proveniência, licença e atribuição

- Repositório: [jackdepaula/br-brazil](https://github.com/jackdepaula/br-brazil).
- Commit de todos os nove arquivos: `1aae6a91b196f7c55224cd47ee4a31431d45fe3a`.
- Atribuição exibida: **OpenFootball — fork jackdepaula/br-brazil**.
- Licença: **CC0 1.0 Universal**; texto completo copiado em `data/source-snapshots/openfootball-br-2003-2011/LICENSE.md`.
- Hashes blob do Git e SHA-256 de cada arquivo de origem estão anexados à temporada correspondente em `src/historicalSeasons.ts`; o empacotador valida commit, blob, contagem e estrutura antes de gerar.

## Cruzamento amostral RSSSF

Uma partida datada por temporada foi comparada aos resultados listados na página RSSSF correspondente. A confirmação da amostra atesta apenas esses nove jogos, não todas as partidas nem a classificação final.

| Ano | Data | Mandante | Visitante | Placar | Referência RSSSF |
|---|---|---|---|---|---|
| 2003 | 29/03 | Guarani | Vasco | 4–2 | [RSSSF 2003](https://www.rsssfbrasil.com/tablesae/br2003.htm) |
| 2004 | 21/04 | Botafogo | Goiás | 1–4 | [RSSSF 2004](https://www.rsssfbrasil.com/tablesae/br2004.htm) |
| 2005 | 23/04 | Paraná | Goiás | 0–2 | [RSSSF 2005](https://www.rsssfbrasil.com/tablesae/br2005.htm) |
| 2006 | 15/04 | Juventude | Paraná | 1–0 | [RSSSF 2006](https://www.rsssfbrasil.com/tablesae/br2006.htm) |
| 2007 | 12/05 | Figueirense | Atlético-PR | 3–6 | [RSSSF 2007](https://www.rsssfbrasil.com/tablesae/br2007.htm) |
| 2008 | 10/05 | Náutico | Goiás | 2–1 | [RSSSF 2008](https://www.rsssfbrasil.com/tablesae/br2008.htm) |
| 2009 | 09/05 | Sport | Barueri | 1–1 | [RSSSF 2009](https://www.rsssfbrasil.com/tablesae/br2009.htm) |
| 2010 | 08/05 | Botafogo | Santos | 3–3 | [RSSSF 2010](https://www.rsssfbrasil.com/tablesae/br2010.htm) |
| 2011 | 21/05 | Ceará | Vasco | 1–3 | [RSSSF 2011](https://www.rsssfbrasil.com/tablesae/br2011.htm) |

## Discrepâncias e parsing

1. **2004, total de jogos do Figueirense:** a tabela final RSSSF indica 45 jogos, enquanto a lista de resultados RSSSF e o snapshot OpenFootball registram 46. Não se escolhe uma interpretação para fabricar uma tabela: a classificação oficial de 2004 não é declarada nem exibida.
2. **2004, São Caetano:** RSSSF registra dedução de 24 pontos. O app não aplica a dedução nem apresenta uma tabela de pontos como oficial.
3. **São Paulo–São Caetano, 2004:** o snapshot mostra `*0x0*` para o intervalo abandonado em 27/10 e o placar concluído 4–2 em 03/11. O parser ignora apenas a linha marcada como abandonada e mantém o 4–2 final.
4. **Brasiliense–Vasco, 2005:** o placar jogado de 24/04 no OpenFootball é 2–2; a tabela RSSSF registra 0–1 por decisão administrativa. O pacote conserva o resultado publicado na fonte escolhida, sem converter decisão administrativa em placar de jogo.
5. **Replays de 2005:** onze pares de clubes aparecem em três jogos por conta de replays. Os registros continuam separados; duplicidade é determinada por fixture (rodada, data e direção), não apenas por par de clubes.
6. **Ordem e horário no pacote:** o 6º campo de cada tupla (`sourceOrdinal`) é o índice cronológico 1-based do pacote, não o ordinal impresso na fonte. O empacotador ordena por kickoff e desempata pela ordem de leitura; por isso o índice pode divergir do ordinal original (2003: 206 de 552; 2007: `gremio 0–2 cruzeiro` é 51 na fonte e 52 no pacote). Como o OpenFootball descarta a hora, todo kickoff dessa camada é normalizado para `T00:00`; somente o Football-Data preserva o horário do CSV.

## Regeração e verificações

```sh
node scripts/pack-history.mjs
npx vitest run scripts/pack-history.test.mjs src/projection.test.ts src/modelBacktest.test.ts src/seasonStats.test.ts
```

O empacotador falha diante de hash/commit divergente, clubes inesperados, contagens diferentes, identidade de fixture duplicada, anomalias de clube/fixture não documentadas ou ordem não determinística. Testes ainda verificam o isolamento pré-2012 e o H2H, incluindo os replays. A suíte (`npm test`) recalcula o blob SHA-1 dos nove arquivos OpenFootball e confere tanto `OPENFOOTBALL_BLOBS` quanto o `provenance.blobSha`/`provenance.sha256` do pacote, de modo que a condição de integridade é verificada sem rodar o empacotador.

## Camada de corroboração secundária (Wikipédia, CC BY-SA 4.0)

O histórico de 2003–2011 tem **duas camadas separadas**:

1. **Canônica — OpenFootball (CC0).** É a única origem dos placares publicados.
   Os snapshots ficam em `data/source-snapshots/openfootball-br-2003-2011/` e
   alimentam `scripts/pack-history.mjs`, que gera `src/historicalSeasons.ts`.
   O runtime lê apenas esse pacote gerado.
2. **Corroboração secundária — Wikipédia em inglês (CC BY-SA 4.0).** Sidecar
   versionado em `data/corroboration/wikipedia/`, um JSON por temporada, com
   `article`, `oldid` (permalink fixo), `retrieved_at` em UTC, `license` e
   `modifications`. Nenhum arquivo de `src/` importa esse diretório, e o
   empacotador não o lê.

As duas camadas são comparadas apenas por `scripts/crosscheck-wikipedia.mjs`,
offline e determinístico. As saídas são `reports/crosscheck-2003-2011.md` e
`reports/conflicts.json`.

### Identidade de fixture

A matriz da Wikipédia não traz datas e traz rodada apenas no artigo de 2007.
Por isso a chave é `(temporada, mandante, visitante)` na direção do mando.
Replays de 2005 continuam entradas distintas: quando o OpenFootball tem mais de
um fixture com o mesmo mandante e visitante, o cross-check **não deduplica por
par de clubes** e reporta o caso como identidade ambígua, sem comparar placar.
Divergência de mando (mesmo par em direção invertida) também é reportada como
ambiguidade, nunca como conflito de placar.

### Status por temporada

| Temporada | Status no sidecar | Motivo |
|---|---|---|
| 2003 | `not_corroborated` | Seção de resultados marcada com `{{citation needed}}`; excluída do cross-check. |
| 2004 | `corroboration_unavailable` | Artigo sem matriz de resultados na revisão fixada. |
| 2005 | `corroboration_unavailable` | Artigo sem matriz de resultados na revisão fixada. |
| 2006 | `corroborated` | Matriz completa extraída e validada. |
| 2007 | `corroborated` | Matriz completa extraída e validada. |
| 2008 | `corroboration_unavailable` | Artigo sem matriz de resultados na revisão fixada. |
| 2009 | `corroborated` | Matriz completa extraída e validada. |
| 2010 | `corroborated` | Matriz completa extraída e validada. |
| 2011 | `corroborated` | Matriz completa extraída e validada. |

Resultado do cross-check atual: **1.898 partidas comparadas**, 1.889
coincidências, **9 divergências** (2006: 2; 2007: 6; 2009: 1; 2010: 0; 2011: 0)
e 2 identidades ambíguas em 2009 (Botafogo–Flamengo, com dois jogos com mando
de Botafogo no OpenFootball e um em cada direção na Wikipédia).

### Política de conflito

- O valor canônico é sempre o do OpenFootball. O cross-check **não altera**
  `src/historicalSeasons.ts`; um teste falha se um placar exclusivo da Wikipédia
  aparecer no pacote canônico.
- Toda divergência entra em `reports/conflicts.json` com `status: "open"`,
  `resolution: null` e a evidência das duas fontes, incluindo `oldid`.
- Divergência **não** é resolvida por maioria, recência ou votação. Resolução
  exige evidência primária e revisão humana; quando resolvida, o registro deve
  ganhar `status: "resolved"` com a justificativa.
- Coincidência entre OpenFootball e Wikipédia é **corroboração secundária**, não
  prova de exatidão: a Wikipédia é editável e não tem revisão editorial
  garantida.

### Limitação principal

Não existe fonte aberta, licenciada e independente cobrindo todos os placares de
2003–2011. A camada canônica continua sendo uma fonte única (OpenFootball), e a
Wikipédia cobre apenas cinco temporadas com matriz de resultados. Por isso o
histórico de 2003–2011 permanece **descritivo/H2H**, fora de treino, projeção,
calibração e backtest; `modelableHistoricalSeasons` segue com corte em 2012.

### Regeração e verificação da corroboração

```sh
node scripts/fetch-wikipedia-corroboration.mjs   # rede; refaz o sidecar a partir dos oldids fixados
node scripts/crosscheck-wikipedia.mjs            # offline; gera reports/
npx vitest run scripts/crosscheck-wikipedia.test.mjs
```

O gerador falha se a API devolver revisão diferente da fixada, se um clube não
tiver mapeamento, se a contagem de clubes/partidas divergir, se houver
autoconfronto, placar inválido, par sem ida e volta ou inconsistência
aritmética. O cross-check falha se o SHA-256 de um JSON divergir do
`manifest.json`.
