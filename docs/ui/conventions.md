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
- O layout adapta os componentes com media queries locais (breakpoints presentes incluem 640, 767, 900, 1023/1024 e 1280 px); conferir tabelas/controles estreitos em mobile e foco/contraste em cada interação.

## Verificação

- Rodar testes focados da tela/componentes alterados; executar `npm test`, `npm run build` e `npm run smoke:pages` para mudanças de integração como adições de dados que cruzam múltiplas abas.
- Para mudanças visíveis em layout/interaction, revisar screenshot Playwright em desktop e viewport mobile; não usar snapshots de componentes como substituto de testes de comportamento.
