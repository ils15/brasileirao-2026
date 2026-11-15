# brasileirao-2026

Painel analítico e preditivo da Série A do Campeonato Brasileiro 2026: classificação por recorte, confrontos, projeções Monte Carlo e simulador de resultados.

[![CI](https://github.com/ils15/brasileirao-2026/actions/workflows/pages.yml/badge.svg)](https://github.com/ils15/brasileirao-2026/actions/workflows/pages.yml)
[![Demo](https://img.shields.io/badge/demo-online-brightgreen)](https://ils15.github.io/brasileirao-2026/)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green)](LICENSE)
![Node](https://img.shields.io/badge/Node-24-339933?logo=node.js&logoColor=white)

## O que é

Aplicação 100% client-side (React + TypeScript + Vite) com dados estáticos versionados no próprio repositório — não há backend nem chamadas de API em tempo de execução. A navegação é organizada em cinco abas:

- **Visão Geral** — KPIs da temporada, líder e artilharia
- **Classificações & Análises** — tabela geral, mandante, visitante, por turno, sequências e evolução de posições por rodada
- **Jogos & Confrontos** — calendário, próxima rodada com probabilidades V/E/D e histórico frente a frente desde 2003
- **Projeções & Simulador** — 500.000 simulações Monte Carlo em Web Worker (título, Libertadores, Sul-Americana e rebaixamento) e simulador interativo de resultados restantes
- **Metodologia & Auditoria** — backtest walk-forward, Brier Score e conciliação entre fontes

O **corte analítico** atual é **14/11/2026 às 23:39:43 BRT** (`2026-11-15T02:39:43Z`), reunindo 341 resultados de 2026 (380 partidas no calendário, 39 pendentes) e retrospecto histórico de 9.176 partidas (2003–2025).

Detalhes do modelo em [docs/metodologia.md](docs/metodologia.md). Demais documentação: [auditoria de cálculos](docs/auditoria-calculos.md), [dicionário de dados](docs/dicionario-dados.md), [log de atualizações](docs/atualizacoes.md) e [histórico 2003–2011](docs/historico-2003-2011.md).

## Demo

https://ils15.github.io/brasileirao-2026/

Publicado pelo workflow `.github/workflows/pages.yml` a cada push em `main`.

## Instalação

Requer Node 24 (versão usada no CI) e npm.

```bash
git clone https://github.com/ils15/brasileirao-2026.git
cd brasileirao-2026
npm ci
```

## Uso

```bash
npm run dev          # servidor de desenvolvimento em http://localhost:5173/
npm run build        # tsc -b && vite build
npm run preview      # serve a build local
npm test             # vitest run
npm run test:watch   # vitest em modo watch
npm run smoke:pages  # valida caminhos de assets do build do GitHub Pages
```

Pipeline de dados:

```bash
npm run pack:history   # reconstrói src/historicalSeasons.ts (OpenFootball + Football-Data)
npm run crosscheck     # valida o histórico 2003–2011 contra a Wikipédia
npm run update:data    # atualiza snapshots de placares e reexecuta a conciliação
```

Para build idêntico ao do Pages (base `/brasileirao-2026/`):

```bash
GITHUB_PAGES=true npm run build && npm run smoke:pages
```

Hooks de commit opcionais (rodam testes e build antes de commitar):

```bash
node scripts/install-hooks.mjs
```

## Estrutura

```
src/                 # aplicação React + TypeScript
  matchModel.ts      # lambdas Poisson, encolhimento e blend xG
  projection.ts      # simulação Monte Carlo
  projection.worker.ts
  projectionConfig.ts  # constantes (500k simulações, semente, zonas)
scripts/             # pipeline, auditoria e empacotamento de dados
data/                # snapshots brutos e corroboração Wikipédia
docs/                # documentação técnica
```

## Licença

- **Código-fonte** (`src/`, `scripts/`, configuração, `docs/`): [MIT](LICENSE).
- **Snapshots OpenFootball** (`data/source-snapshots/openfootball-br-2003-2011/`): [CC0-1.0](data/source-snapshots/openfootball-br-2003-2011/LICENSE.md).
- **Corroboração Wikipédia** (`data/corroboration/wikipedia/`): [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Detalhamento por diretório em [NOTICE](NOTICE).
