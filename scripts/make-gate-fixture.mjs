/**
 * Gera/regera a fixture sintética `data/fixtures/gate-repro/` (npm run fixture:gate).
 *
 * A saída é determinística: rodar duas vezes deve deixar `git diff --exit-code`
 * limpo. Tudo deriva do calendário CBF (`src/cbfOfficialSchedule.ts`), dos
 * resultados empacotados (`src/currentSeasonResults.ts`) e do corte analítico
 * (`src/sourceMetadata.ts`) — nunca de um literal copiado à mão.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { loadCbfSchedule, readCurrentCutoff } from './lib/dataPipeline.mjs'
import { addUtcDays, buildFixtureBundle, parsePackedResults } from './lib/gateFixture.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const fixtureDir = join(root, 'data/fixtures/gate-repro')

const README = `# Fixture sintética do gate (gate-repro)

## DADOS SINTÉTICOS — não são resultados reais

Este diretório **não** contém coleta de nenhuma fonte. Os placares são inventados
por uma regra determinística (\`homeGoals = índice % 3\`, \`awayGoals = (índice + 1) % 2\`)
sobre partidas **pendentes** do calendário CBF 2026, no formato do scoreboard da ESPN.

## Para que serve

O updater escreve o pacote e só depois roda os testes; enquanto dois testes de UI
dependeram do conteúdo do pacote, uma rodada real deixava a suíte vermelha e nada
era commitado. Esta fixture move o pacote para exatamente esse estado, **offline e
determinístico**, para que a regressão seja reproduzível:

\`\`\`bash
npm run fixture:gate   # regenera esta pasta a partir do pacote atual
npm run repro:gate     # copia os payloads, roda o updater e restaura a árvore
\`\`\`

\`repro:gate\` restaura os caminhos de dados no \`finally\`, então os payloads daqui
nunca ficam em \`data/source-snapshots/\`. Nenhum arquivo de \`src/**\` pode importar
deste diretório (há teste vigiando).

## Arquivos

- \`espn-scoreboard-<data>.json\` — payload sintético; \`<data>\` é o dia do corte + 1.
- \`expected.json\` — os pares que o updater deve incorporar (\`added\`, \`newResults\`).
- \`manifest.json\` — sha256 de cada payload e do expected; o harness recusa hash divergente.

Não edite à mão: a única forma aceita de mudar a fixture é \`npm run fixture:gate\`.
`

function main() {
  const schedule = loadCbfSchedule(srcDir)
  const existing = parsePackedResults(readFileSync(join(srcDir, 'currentSeasonResults.ts'), 'utf8'))
  const cutoffUtc = readCurrentCutoff(readFileSync(join(srcDir, 'sourceMetadata.ts'), 'utf8'))
  const targetDate = addUtcDays(cutoffUtc.slice(0, 10), 1)

  const bundle = buildFixtureBundle({ schedule, existing, targetDate })

  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(join(fixtureDir, 'README.md'), README)
  for (const file of bundle.files) {
    writeFileSync(join(fixtureDir, file.path), file.content)
  }

  console.log(`Fixture ${targetDate} (corte ${cutoffUtc}) · ${bundle.pairs.length} pares sintéticos`)
  for (const pair of bundle.pairs) {
    console.log(`  ${pair.ref} (rodada ${pair.round}) ${pair.home} ${pair.homeGoals}–${pair.awayGoals} ${pair.away}`)
  }
  console.log(`Escrito em ${fixtureDir.replace(`${root}/`, '')}: README.md, ${bundle.files.map((file) => file.path).join(', ')}`)
}

try {
  main()
} catch (error) {
  console.error(`fixture:gate abortado: ${error.message}`)
  process.exit(1)
}
