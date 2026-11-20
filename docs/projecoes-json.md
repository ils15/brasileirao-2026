# `projecoes.json` — projeção publicada para consumo externo

`public/projecoes.json` publica o resultado bruto da projeção Monte Carlo da
Série A 2026 em um arquivo estático, gerado pelo pipeline e servido junto com o
site. Existe para que consumidores externos — agentes, outros projetos, o
próprio app no caminho rápido de carregamento — tenham os percentuais exatos
sem re-simular 500 mil temporadas.

- **Fonte única**: `runProjectionRaw()` de `src/projection.ts`, a mesma função
  que o Web Worker chama. Nenhuma fórmula é reimplementada no gerador.
- **Constantes de produção**: `SIMULATION_COUNT`, `SIMULATION_SEED` e
  `BACKTEST_SIMULATIONS` de `src/projectionConfig.ts`. Não há flag para
  alterá-las; o arquivo publicado é sempre o do app.
- **Gerado por**: `npm run projections:json` (`scripts/generate-projections.mjs`),
  chamado por `scripts/update-data.mjs` depois de regenerar os módulos e
  commitado junto com o pacote de dados.
- **Nunca editar à mão.** Regenerar é a única forma correta de mudar o arquivo.

## Contrato: contagens inteiras, não percentuais

Todo campo de contagem é o número **inteiro e exato** de simulações que caiu
naquele desfecho. A divisão por `simulations` é responsabilidade de quem lê:
arredondar no arquivo destruiria justamente a exatidão que justifica publicá-lo.

```jsonc
{
  "schemaVersion": 2,
  "generatedAt": "<carimbo do pacote de dados, ISO>",
  "simulations": 500000,
  "seed": 20261104,
  "backtestSimulations": 5000,
  "analyticalCutoffUtc": "<corte analítico do pacote, ISO>",
  "inputHash": "<16 dígitos hex>",
  "model": {
    "leagueAverageGoals": { "home": 0, "away": 0 },
    "trainingGoalAverages": { "home": 0, "away": 0 }
  },
  "clubs": [
    {
      "id": "flamengo",
      "club": "Flamengo",
      "currentPosition": 1,
      "currentPoints": 0,
      "positionCounts": [0, 0, "… 21 posições, índice 0 sem uso"],
      "scenarioCounts": [
        { "scenarioKey": 0, "libertadoresTo": 5, "directTo": 4, "libertadores": 0, "direct": 0 }
      ],
      "pointsStats": { "samples": 0, "mean": 0, "median": 0, "stdDev": 0, "min": 0, "max": 0, "p10": 0, "p25": 0, "p75": 0, "p90": 0 }
    }
  ],
  "pointsByPosition": [
    { "points": 0, "positionCounts": [0, "21 posições, índice 0 sem uso"] }
  ],
  "pointCurve": {
    "simulationCount": 500000,
    "points": [0, "… pontuações distintas, ordem crescente"],
    "masks": [
      [0, "… máscaras de posição observadas nessa pontuação"]
    ],
    "counts": [
      [0, "… simulações que produziram a máscara de mesmo índice"]
    ]
  },
  "backtest": {},
  "featureBacktest": {}
}
```

Os zeros acima são marcadores de tipo, não valores do pacote.

## Campos

| campo | significado |
|---|---|
| `schemaVersion` | versão do contrato deste arquivo; muda só com quebra de schema |
| `generatedAt` | carimbo do **pacote de dados** (`CURRENT_SEASON_PACK_GENERATED_AT`), não o relógio da execução — duas execuções sobre o mesmo pacote produzem bytes idênticos |
| `simulations` | temporadas simuladas; denominador de toda probabilidade |
| `seed` | semente do PRNG; mesma semente + mesmos dados = mesmas contagens |
| `backtestSimulations` | simulações por temporada no backtest de tabela que acompanha o documento |
| `analyticalCutoffUtc` | corte analítico do pacote (`src/sourceMetadata.ts`) |
| `inputHash` | impressão digital determinística das entradas (ver abaixo) |
| `model.leagueAverageGoals`, `model.trainingGoalAverages` | médias de gols por mando usadas no λ da simulação |
| `clubs[]` | um item por clube, na ordem da tabela do pacote |
| `clubs[].positionCounts` | `positionCounts[p]` = temporadas simuladas em que o clube terminou na posição `p`; `positionCounts[0]` é sempre 0; a soma é `simulations` |
| `clubs[].scenarioCounts` | as 16 combinações de devolução de vaga da Libertadores (`scenarioKey` 0–15), cada uma com `libertadoresTo`/`directTo` resolvidos e as contagens de classificados |
| `clubs[].pointsStats` | resumo da distribuição de pontos finais do clube (média, mediana, desvio, mínimo, máximo e percentis) |
| `pointsByPosition` | tabela global pontos × posição: `positionCounts[p]` = clubes que terminaram com aquela pontuação naquela posição; a soma de todas as linhas é `simulations × clubes` |
| `pointCurve` | agregado da curva de pontos, independente de cenário (schema 2): arrays paralelos `points[]`, `masks[][]`, `counts[][]`; `masks[i][j]` é a máscara de 20 bits (bit 0 = 1º) das posições ocupadas por clubes que terminaram `points[i]` naquela simulação, e `counts[i][j]` é quantas simulações produziram essa máscara. Ver “ICs cluster-robustos exatos” |
| `backtest`, `featureBacktest` | resumos walk-forward que acompanham a projeção (Brier por temporada, seleção de `k` e do peso do blend xG) |

`scenarioCounts` não depende do cenário ativo do painel: o app escolhe a chave e
lê a linha correspondente, sem re-simular. `scenarioKey` é o bitmask do REC CBF
2026 — bit 0 campeão da Copa do Brasil, bit 1 vice, bit 2 campeão da Libertadores,
bit 3 campeão da Sul-Americana.

## Como derivar probabilidades

Chance de um desfecho = **soma das contagens daquela faixa de posições dividida
por `simulations`**.

```js
const doc = JSON.parse(await (await fetch('/projecoes.json')).text())
const clube = doc.clubs.find((entry) => entry.id === 'flamengo')
const soma = (counts, from, to) => {
  let total = 0
  for (let position = from; position <= to; position += 1) total += counts[position]
  return total
}

// Libertadores direto (1º–4º, cenário G-5 = nenhuma devolução)
const direto = soma(clube.positionCounts, 1, 4) / doc.simulations
// Rebaixamento: sempre 17º–20º
const risco = soma(clube.positionCounts, 17, 20) / doc.simulations
```

Exemplo numérico sintético: se `positionCounts[1..4]` somam 37 500 e
`simulations` é 500 000, a probabilidade de vaga direta é `37 500 / 500 000 =
0,075` (7,5%). A faixa de Libertadores de um cenário específico sai de
`scenarioCounts.find((s) => s.scenarioKey === chave)`: `libertadores` já traz a
contagem até `libertadoresTo` e `direct` até `directTo`.

## `inputHash` — provar que os dois lados partiram do mesmo pacote

`computeProjectionInputHash()` (`src/projectionInputHash.ts`) é síncrona e roda
no Node e no navegador. Ela serializa de forma canônica — identidade da captura
secundária de xG/cartões (`fetchedAt` + `coverage.matches/expected` de
`src/advancedStats2026.ts`), corte analítico, número de partidas disputadas,
clubes ordenados por id (`id|posição|pontos`) e jogos pendentes ordenados por
`(rodada, casa, fora)` — e aplica FNV-1a de 64 bits sobre o UTF-8, devolvendo 16
dígitos hex. O cabeçalho carrega a versão da definição (`v2`); subir o formato
sem subir a versão deixaria hashes antigos colidirem com os novos.

Consequências úteis:

- a ordem incidental dos módulos não muda o hash (o updater reescreve os arquivos);
- mudar corte, pontos de um clube, uma partida disputada ou o calendário
  pendente muda o hash;
- uma nova captura de xG/cartões (`fetchedAt`) ou uma cobertura diferente muda o
  hash: o xG entra em `estimateExpectedGoals`, então o artefato antigo deixa de
  ser aceito como atual mesmo que o placar empacotado não tenha mudado;
- o app e o gerador calculam o mesmo valor sobre os mesmos módulos, então o
  `inputHash` publicado é a prova de que a projeção corresponde ao pacote do
  commit.

## ICs cluster-robustos exatos (schema 2)

Aba “Por pontuação” publica, para cada faixa de pontos, a probabilidade de um
desfecho (título, Libertadores, Sul-Americana, meio, rebaixamento) com IC 95%
**cluster-robusto por temporada simulada**: a influência de cada simulação leva
em conta que os 20 clubes de uma mesma temporada são correlacionados. O worker
calcula isso a partir do histograma `pontuação → máscara de posições →
simulações` (`PointOutcomeCurveSnapshot` em `src/pointCurve.ts`).

As contagens marginais (`positionCounts`, `pointsByPosition`) não bastam: elas
dizem quantos clubes caíram em cada (posição, pontuação), mas não **quais**
caíram juntos na mesma temporada. Um cliente que sintetiza máscaras a partir das
marginais preserva probabilidade, sucessos e denominador, mas perde a
covariância intra-simulação — e o IC sai mais **estreito** que o do worker. Dois
números diferentes para o mesmo rótulo era exatamente o defeito que o schema 2
corrige.

Por isso o documento publica o agregado bruto:

```js
import { buildPointOutcomeCurveFromSnapshot } from './pointCurve'
// snapshot publicado → curva idêntica à do worker, cenário a cenário
const curve = buildPointOutcomeCurveFromSnapshot(document.pointCurve)
```

Garantia: `buildPointOutcomeCurveFromSnapshot(document.pointCurve)` é
numericamente igual a `deriveProjectionResult(raw).pointCurve` sobre o snapshot
em memória da mesma execução — igualdade exata de `probability`, `lower95`,
`upper95`, `successes`, `denominator` e `clusterCount`, verificada em
`scripts/generate-projections.test.mjs`. Não há aproximação nem re-simulação.

Custo medido com as constantes de produção (500 000 simulações, semente
20261104): 64 pontuações distintas e 497 máscaras — o snapshot serializado
compacto tem **5,2 KB**; dentro do documento com indentação de 2 espaços ele
ocupa **16,1 KB**, levando o arquivo de **94,2 KB para 110,3 KB**.

## Consumo no app

O painel de Projeções lê este arquivo antes de simular (`src/projectionsSnapshot.ts`
valida, `ProjectionContext` decide):

- URL montada com `import.meta.env.BASE_URL` — sob o Pages o base é
  `/brasileirao-2026/` — e `cache: 'no-cache'`, para o browser não servir uma
  cópia velha sem revalidar.
- O documento só é adotado quando `schemaVersion` é **exatamente 2**, as
  contagens e o `pointCurve` fecham o contrato e `inputHash` é igual ao
  `computeProjectionInputHash()` do build. Artefato de outro pacote ou de
  schema 1 é descartado e o app recalcula no Web Worker; `retry` ignora o
  arquivo de propósito, porque é pedido de recálculo.
- `schemaVersion` é o contrato entre gerador e leitor: `PROJECTIONS_SCHEMA_VERSION`
  (`scripts/lib/projectionsJson.mjs`) e `PROJECTIONS_SNAPSHOT_SCHEMA_VERSION`
  (`src/projectionsSnapshot.ts`) sobem no mesmo commit. Não há leitura de v1:
  versão diferente vira `null` e o caminho rápido cede ao worker — fallback,
  nunca número errado.
- A curva da aba “Por pontuação” vem do `pointCurve` do arquivo; o leitor
  valida o agregado expandindo as máscaras por posição contra
  `pointsByPosition` e rejeita o documento inteiro quando não fecha. Nada é
  sintetizado a partir das marginais, então os ICs cluster-robustos do
  caminho rápido são idênticos aos do worker.
- O fetch tem timeout curto e independente do watchdog do worker. Nenhuma
  falha do caminho rápido vira tela de erro — todas caem no worker.

## Regenerar

```bash
npm run projections:json              # escreve public/projecoes.json
npm run projections:json -- --dry-run # simula e valida sem escrever (~18 s)
npm run projections:json -- --out /tmp/p.json
```

O gerador falha alto se o documento não fechar o contrato (soma das posições
diferente de `simulations`, `scenarioKey` fora de 0–15, `pointsByPosition`
incompleto, hash malformado). Desde o schema 2, a validação também exige
`pointCurve`, confere `simulationCount === simulations`, máscaras dentro dos
20 bits e — a checagem que sustenta o rótulo do IC — expande as máscaras por
posição e reprova se elas não reproduzirem `pointsByPosition` exatamente e o
total `simulations × clubes`. Não existe caminho que publique arquivo inválido.

## Custo e por que não está na suíte

500 mil simulações + backtest de 5 000 por temporada custam ~18 s. Por isso o
gerador **não** roda em `npm test` nem em `npm run test:data`: o teste
`scripts/generate-projections.test.mjs` injeta 200 simulações e valida o schema,
as somas, o hash e o round-trip do `pointCurve`. O pipeline gera o arquivo real
só quando há dado novo (o updater retorna antes de qualquer escrita quando a
regeneração é idêntica).
