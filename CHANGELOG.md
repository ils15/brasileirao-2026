# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere ao
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [1.1.0] - 2026-11-19

### Adicionado

- Carregamento sob demanda por aba: o conteúdo só é montado quando a aba é aberta.
- Snapshot de xG auto-descritivo, com procedência e cobertura declaradas no módulo.
- Alarme agendado de frescor do pacote de dados, independente de push ou deploy.
- Workflow reutilizável de build/deploy do Pages, compartilhado pelos publicadores.
- Texto explicativo nas disclosures, para o leitor entender o que cada seção cobre.

### Alterado

- Backtest walk-forward saiu do boot: roda quando a análise é pedida, não no carregamento.
- Artilharia passou a ser derivada dos eventos de partida da ESPN, com snapshot normalizado por jogo.
- Gate de ingestão (`test:data`) separado do gate de publicação (suíte completa).
- Push do updater usa rebase com retry, sem `--force`.

### Removido

- Integração com a API Futebol BR (trial encerrado, HTTP 429 permanente).

## [1.0.0] - 2026-11-14

Baseline do painel: cinco abas, projeções Monte Carlo em Web Worker, backtest
walk-forward por temporada/rodada e dados de temporada versionados no repositório.
