# Metodologia — modelo estatístico e projeções

O modelo preditivo estima a taxa esperada de gols ($\lambda$) de cada confronto combinando médias ajustadas por mando com encolhimento bayesiano empírico e blend com Expected Goals ($xG$):

$$\text{taxa}_{c,v} = \frac{\text{gols 2026}_{c,v} + k \times \text{taxa histórica}_{c,v}}{\text{jogos 2026}_{c,v} + k}$$

$$\lambda_{\text{casa}} = \mu_{\text{casa}} \times \left(\frac{\text{ataque}_{\text{mandante, casa}}}{\mu_{\text{casa}}}\right) \times \left(\frac{\text{defesa}_{\text{visitante, fora}}}{\mu_{\text{casa}}}\right)$$

$$\lambda_{\text{fora}} = \mu_{\text{fora}} \times \left(\frac{\text{ataque}_{\text{visitante, fora}}}{\mu_{\text{fora}}}\right) \times \left(\frac{\text{defesa}_{\text{mandante, casa}}}{\mu_{\text{fora}}}\right)$$

- **Histórico no modelo**: 5.319 partidas de 2012–2025 (Football-Data). O histórico 2003–2011 (OpenFootball) é estritamente descritivo para H2H e não entra no treinamento.
- **Blend de $xG$**: $\lambda_{\text{produção}} = (1 - w) \cdot \lambda_{\text{gols}} + w \cdot \lambda_{xG}$, calibrado por walk-forward.
- **Simulações**: 500.000 iterações Monte Carlo em Web Worker paralelo com semente pseudoaleatória determinística fixa, garantindo reprodutibilidade matemática estrita.

## Constantes vigentes

Definidas em `src/projectionConfig.ts`:

| Constante | Valor |
|---|---|
| `SIMULATION_COUNT` | 500.000 |
| `SIMULATION_SEED` | 20261104 |
| `BACKTEST_SIMULATIONS` | 5.000 |
| `SHRINKAGE_MATCHES` | 20 |
| `XG_BLEND_WEIGHT` | 0.15 |
| `MC_CI_Z` | 1.96 |

## Cobertura parcial de xG/cartões

`src/advancedStats2026.ts` declara `coverage: { matches, expected, missing }`: quantos
jogos do pacote têm registro, quantos o pacote tem e quais pares ficaram sem registro.
A UI exibe `matches/expected partidas` e deriva o status do próprio módulo; quando
`matches < expected`, o rótulo é **cobertura parcial** e os pares ausentes ficam
listados em um disclosure. Cobertura parcial nunca é apresentada como completa.

- O denominador das taxas de disciplina é `matchesCovered` por clube — o número de
  registros daquele clube no snapshot 365scores, não o total de jogos do pacote
  (`src/discipline.ts`). Cartões reais só entram onde há registro; jogos restantes
  usam a taxa por jogo coberto.
- O blend de xG usa somente as partidas com xG; jogos sem registro continuam no
  modelo de gols. A publicação é monotônica: uma coleta com menos partidas que a
  anterior não substitui o módulo.

## Leitura complementar

- [Auditoria de cálculos](auditoria-calculos.md) — fórmulas duplicadas removidas, guardas e efeito nas grandezas publicadas.
- [Dicionário de dados](dicionario-dados.md)
- [Histórico da Série A 2003–2011](historico-2003-2011.md)
