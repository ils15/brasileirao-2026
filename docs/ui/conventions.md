# Convenções de UI

Atualizado em 2026-11 para o trabalho de retrospecto H2H e auditoria.

## Stack

- React 19.3.1, TypeScript 7.0.2 em modo `strict`, Vite 8.3.5.
- CSS próprio em `src/styles.css`; não há Tailwind nem biblioteca de componentes.
- Testes de comportamento: Vitest 5.0.5, Testing Library React 16.3.3 e `user-event` 14.6.8.

## Padrões em uso

- Componentes funcionais com props tipadas; estado de seleção e filtros fica local em hooks. Derivações reutilizáveis usam `useMemo` quando adequado.
- Estrutura semântica (`section`, headings, labels, lists, tables) com nomes acessíveis para controles e regiões roláveis. Mudanças interativas cobrem estados e eventos com Testing Library.
- CSS centralizado em `styles.css`, classes de componente e custom properties de cor, foco, superfícies e raios definidas em `:root`. Propriedades calculadas para largura proporcional de gráficos são o uso inline dinâmico observado; preferir classes para estilos estáticos.
- Interface em português, datas em pt-BR e valores numéricos apresentados com `Intl.NumberFormat`; tabelas com cabeçalhos e `scope` explícitos.
- Indicadores ordenados (ex.: probabilidade por pontuação) colapsam faixas contíguas de mesmo texto formatado em uma linha de intervalo (`21–37`), com o texto visível `aria-hidden="true"` e a barra (`role="img"` com `aria-label`) como fonte acessível do valor e do IC. (i) Faixas de valor observado exigem pontos adjacentes e mesmo texto formatado; valores apenas parecidos ou lacunas numéricas quebram a faixa. (ii) O bloco de zero (`nenhum rebaixamento`, `nenhum título`, `nenhuma vaga na Libertadores`, `nenhuma na Sul-Americana`) agrupa 0 sucessos independentemente de N e pode atravessar totais de pontos sem simulação, anunciando o N como intervalo. (iii) O IC 95% é omitido em faixas com 2+ pontos; faixas de 1 ponto mantêm o IC, repetido só quando difere do anterior. (iv) No rebaixamento, a tabela começa na primeira pontuação com 100,00% de rebaixamento e valores menores não são exibidos.
- Zonas da classificação usam uma legenda única de chips (`ZoneLegend`) dentro do `tabpanel`, acima da tabela, com faixa lateral colorida por linha e zona em texto oculto (`sr-only`) no cabeçalho de linha — sem chips repetidos nem `aria-label` no `tr`.
- O layout adapta os componentes com media queries locais (breakpoints presentes incluem 640, 767, 900, 1023/1024 e 1280 px); conferir tabelas/controles estreitos em mobile e foco/contraste em cada interação.

## Verificação

- Rodar testes focados da tela/componentes alterados; executar `npm test`, `npm run build` e `npm run smoke:pages` para mudanças de integração como adições de dados que cruzam múltiplas abas.
- Para mudanças visíveis em layout/interaction, revisar screenshot Playwright em desktop e viewport mobile; não usar snapshots de componentes como substituto de testes de comportamento.
