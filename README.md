# Brasileirão 2026 — Painel Analítico & Preditivo Série A

[![Deploy to GitHub Pages](https://github.com/ils15/brasileirao-2026/actions/workflows/pages.yml/badge.svg)](https://github.com/ils15/brasileirao-2026/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 212 passed](https://img.shields.io/badge/Tests-212%20passing-brightgreen.svg)](https://github.com/ils15/brasileirao-2026)
[![Stack](https://img.shields.io/badge/Stack-React%2019%20%7C%20TypeScript%20%7C%20Vite%20%7C%20Web%20Workers-blueviolet)](https://github.com/ils15/brasileirao-2026)

> **Ambiente de Produção (GitHub Pages)**: [https://ils15.github.io/brasileirao-2026/](https://ils15.github.io/brasileirao-2026/)

Dashboard moderno, responsivo e de alto rigor estatístico para o Campeonato Brasileiro Série A 2026. O aplicativo opera 100% no cliente (client-side), com dados locais estáticos e reproduzíveis, simulações Monte Carlo multithread via Web Workers, design esportivo Stadium Night / Arctic Day e um novo **Simulador Interativo** de cenários em tempo real.

O **corte analítico** atual é **06/11/2026 às 21:58:14 BRT** (`2026-11-07T00:58:14Z`), reunindo 339 resultados de 2026, 41 jogos pendentes e retrospecto histórico de 9.176 partidas (2003–2025).

---

## Sumário

- [Arquitetura de Navegação (5 Smart Tabs)](#arquitetura-de-navegação)
- [Simulador Interativo do Brasileirão](#simulador-interativo)
- [Guia de Reprodução Rápida](#guia-de-reprodução-rápida)
- [Pipeline de Dados & Scripts](#pipeline-de-dados)
- [Modelo Estatístico & Projeções](#modelo-estatístico)
- [Estrutura do Repositório](#estrutura-do-repositório)
- [Fontes de Dados & Proveniência](#fontes-e-proveniência)
- [Publicação & Integração Contínua](#publicação)
- [Licença](#licença)

---

<a id="arquitetura-de-navegação"></a>
## Arquitetura de Navegação (5 Smart Tabs)

O painel é estruturado em cinco abas acessíveis (`role="tablist"`, navegação por setas e suporte a atalhos), com retrocompatibilidade para todas as âncoras legadas da URL:

1. **🏆 Visão Geral** (`#inicio`):
   - Hero moderno com status do snapshot e atualização.
   - KPIs esportivos da temporada (gols marcados, médias, mandantes vs visitantes).
   - Card de destaque do líder com estatísticas reais (pontos, jogos, vitórias, saldo de gols).
   - Tabela compacta e artilharia da temporada com paginação limpa.
2. **📊 Classificações & Análises** (`#classificacao`):
   - Classificação detalhada com 10 colunas esportivas.
   - Visualizações segmentadas: Geral, Mandante, Visitante, 1º Turno (R1–R19), 2º Turno (R20–R38) e Sequências.
   - Gráficos de evolução de posições rodada a rodada.
3. **⚽ Jogos & Confrontos** (`#jogos`, `#confrontos`, `#calendario`):
   - Central unificada de partidas com filtros por rodada e por clube.
   - Painel da próxima rodada pendente com taxas Poisson estimadas ($\lambda$) e probabilidades $V / E / D$.
   - Histórico direto Frente a Frente (H2H) com retrospecto completo de 2003 a 2026 e calendário restante.
4. **🔮 Projeções & Simulador** (`#projecoes`, `#analise-simulador`):
   - Projeções de fim de campeonato com 500.000 iterações Monte Carlo (título, Libertadores, Sul-Americana e rebaixamento).
   - Curvas de pontuação com intervalos de confiança Wilson 95%.
   - **Simulador Interativo de Resultados**: palpites e cenários instantâneos.
5. **🔬 Metodologia & Auditoria** (`#metodologia`, `#dados`):
   - Backtest histórico walk-forward e ablações de modelos (Brier Score).
   - Conciliação entre fontes, hashes SHA-256 e auditoria de integridade do pacote.

Documentação técnica complementar:
- [Auditoria detalhada de cálculos e comparadores](docs/auditoria-calculos.md)
- [Dicionário de dados](docs/dicionario-dados.md)
- [Log de atualizações](docs/atualizacoes.md)
- [Histórico da Série A 2003–2011](docs/historico-2003-2011.md)

---

<a id="simulador-interativo"></a>
## Simulador Interativo do Brasileirão

Localizado na aba **Projeções & Simulador**, o simulador permite ao usuário brincar com os resultados futuros e ver como as chances de título, copas e rebaixamento reagem:

- **Seleção de Rodadas**: Navegue por qualquer uma das rodadas restantes do campeonato.
- **Palpites Rápidos 1 / X / 2**: Cada partida conta com botões interativos (altura tátil $\ge 44\text{px}$) com as probabilidades calculadas pelo modelo para guiar o palpite.
- **Cenários Pré-configurados (1 Clique)**:
  - `⚡ Mais Prováveis`: Preenche a rodada com o resultado de maior probabilidade estatística.
  - `💥 Cenário Zebra`: Preenche com os resultados mais improváveis.
  - `🏠 Supremacia Mandante`: Simula vitórias de todos os donos da casa.
  - `↺ Limpar Palpites`: Restaura as probabilidades puras do modelo original.
- **Recálculo Imediato**:
  - Classificação simulada em tempo real com saldo de gols e pontos.
  - Badges de variação de posição no ranking: $\blacktriangle$ subiu, $\blacktriangledown$ caiu, $\bullet$ estável.
  - Comparativo dinâmico das probabilidades de **Título**, **Libertadores** e **Z-4 (Rebaixamento)** com indicação visual de ganho ou perda percentual.

---

<a id="guia-de-reprodução-rápida"></a>
## Guia de Reprodução Rápida

### Pré-requisitos
- **Node.js** $\ge 24.0.0$ LTS
- **npm** $\ge 10.0.0$
- **Git**

### 1. Clonar o repositório
```sh
git clone https://github.com/ils15/brasileirao-2026.git
cd brasileirao-2026
```

### 2. Instalar dependências exatas
```sh
npm ci
```

### 3. Rodar localmente (Servidor de Desenvolvimento)
```sh
npm run dev
```
Abra `http://localhost:5173/` no seu navegador.

### 4. Executar os Testes Automatizados (23 suítes, 212 testes)
```sh
npm test
```
Para modo interativo contínuo (watch):
```sh
npm run test:watch
```

### 5. Compilar para Produção
```sh
npm run build
```
Para testar o build exato configurado para o GitHub Pages (com caminho base `/brasileirao-2026/` e smoke test de rotas):
```sh
GITHUB_PAGES=true npm run build
npm run smoke:pages
```

### 6. Instalar Hooks de Commit Locais (Opcional)
Para garantir que nenhum commit seja feito sem antes passar por todos os testes e builds:
```sh
node scripts/install-hooks.mjs
```
*(Para desativar a qualquer momento: `git config --local --unset core.hooksPath`).*

---

<a id="pipeline-de-dados"></a>
## Pipeline de Dados & Scripts

| Comando | Descrição |
|---|---|
| `npm test` | Executa a suíte de 212 testes unitários e de integração via Vitest |
| `npm run smoke:pages` | Valida caminhos de assets e integridade do bundle do GitHub Pages |
| `npm run pack:history` | Reconstrói `src/historicalSeasons.ts` a partir de OpenFootball e Football-Data |
| `npm run crosscheck` | Executa validação cruzada do histórico 2003–2011 contra a Wikipédia |
| `npm run update:data` | Atualiza snapshots de placares e reexecuta conciliação do pacote |

---

<a id="modelo-estatístico"></a>
## Modelo Estatístico & Projeções

O modelo preditivo estima a taxa esperada de gols ($\lambda$) de cada confronto combinando médias ajustadas por mando com encolhimento bayesiano empírico e blend com Expected Goals ($xG$):

$$\text{taxa}_{c,v} = \frac{\text{gols 2026}_{c,v} + k \times \text{taxa histórica}_{c,v}}{\text{jogos 2026}_{c,v} + k}$$

$$\lambda_{\text{casa}} = \mu_{\text{casa}} \times \left(\frac{\text{ataque}_{\text{mandante, casa}}}{\mu_{\text{casa}}}\right) \times \left(\frac{\text{defesa}_{\text{visitante, fora}}}{\mu_{\text{casa}}}\right)$$

$$\lambda_{\text{fora}} = \mu_{\text{fora}} \times \left(\frac{\text{ataque}_{\text{visitante, fora}}}{\mu_{\text{fora}}}\right) \times \left(\frac{\text{defesa}_{\text{mandante, casa}}}{\mu_{\text{fora}}}\right)$$

- **Histórico no modelo**: 5.319 partidas de 2012–2025 (Football-Data). O histórico 2003–2011 (OpenFootball) é estritamente descritivo para H2H e não entra no treinamento.
- **Blend de $xG$**: $\lambda_{\text{produção}} = (1 - w) \cdot \lambda_{\text{gols}} + w \cdot \lambda_{xG}$, calibrado por walk-forward.
- **Simulações**: 500.000 iterações Monte Carlo em Web Worker paralelo com semente pseudoaleatória determinística fixa (`20261104`), garantindo reprodutibilidade matemática estrita.

---

<a id="estrutura-do-repositório"></a>
## Estrutura do Repositório

```text
├── .github/workflows/          # Automações de CI/CD (GitHub Pages e atualização de dados)
├── .githooks/                  # Hooks git opt-in (pre-commit e commit-msg)
├── data/
│   ├── corroboration/          # Camada de checagem cruzada Wikipédia (CC-BY-SA-4.0)
│   └── source-snapshots/       # Snapshots brutos imutáveis (OpenFootball CC0-1.0, etc.)
├── docs/                       # Documentação técnica detalhada
├── scripts/                    # Scripts de pipeline, auditoria, empacotamento e testes
├── src/                        # Código-fonte da aplicação React + TypeScript
│   ├── App.tsx                 # Layout principal e navegação em 5 Smart Tabs
│   ├── MatchSimulator.tsx      # Simulador Interativo do Brasileirão (Novo)
│   ├── ProjectionSection.tsx   # Painel de Projeções e Probabilidades com Heatmaps
│   ├── Confrontos.tsx          # Próxima rodada e H2H
│   ├── projection.worker.ts    # Web Worker Monte Carlo (500k simulações)
│   └── styles.css              # Design system responsivo (Stadium Night / Arctic Day)
├── LICENSE                     # Licença MIT do código-fonte
├── NOTICE                      # Relação de termos e licenças por diretório
└── package.json                # Configuração do projeto e dependências
```

---

<a id="fontes-e-proveniência"></a>
## Fontes de Dados & Proveniência

| Fonte | Uso no Projeto | Licença / Termos |
|---|---|---|
| [Football-Data](https://www.football-data.co.uk/new/BR.csv) | Resultados 2026 e histórico 2012–2025 | Fonte secundária aberta para fins analíticos |
| [ESPN Scoreboard API](https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard) | Conciliação de placares recentes e kickoffs UTC | Uso informativo |
| [CBF — Tabela Básica](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_BA_sica_Brasileiro_SA_rie_A_2026_d64996b4d8.pdf) | Calendário e 380 confrontos da Série A | Documento público oficial CBF |
| [OpenFootball (`jackdepaula/br-brazil`)](https://github.com/jackdepaula/br-brazil) | Histórico descritivo H2H 2003–2011 | **CC0-1.0** (Domínio Público) |
| [Wikipédia em inglês](https://en.wikipedia.org/) | Corroboração cruzada offline 2003–2011 | **CC-BY-SA-4.0** (Sidecar de auditoria) |
| 365scores | Métricas de $xG$ e cartões pós-corte | Uso estatístico complementar |
| API Futebol BR | Artilharia informativa da temporada | Uso descritivo complementar |

---

<a id="publicação"></a>
## Publicação & Integração Contínua

O projeto é implantado automaticamente no **GitHub Pages** a cada push na branch `main` através do workflow `.github/workflows/pages.yml`.

O workflow de CI valida:
1. Instalação rigorosa com dependências fixadas (`npm ci`).
2. Execução integral dos testes automatizados (`npm test`).
3. Compilação estática com verificação estrita de tipagem TypeScript (`GITHUB_PAGES=true npm run build`).
4. Smoke test de caminhos relativos e resolução de assets do Worker (`npm run smoke:pages`).

---

<a id="licença"></a>
## Licença

- **Código-fonte** (`src/`, `scripts/`, configuração, `docs/`): Licenciado sob a [Licença MIT](LICENSE).
- **Snapshots OpenFootball** (`data/source-snapshots/openfootball-br-2003-2011/`): Licenciado sob [CC0-1.0 Universal](data/source-snapshots/openfootball-br-2003-2011/LICENSE.md).
- **Camada de Corroboração Wikipédia** (`data/corroboration/wikipedia/`): Licenciada sob [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Consulte o arquivo [`NOTICE`](NOTICE) para o detalhamento completo dos termos e origens de cada diretório.
