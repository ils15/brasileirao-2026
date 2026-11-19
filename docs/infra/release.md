# Release

Procedimento de versão do painel. O release **verifica** um marco já mergeado;
ele **não** publica o site. Quem builda com `GITHUB_PAGES=true`, roda
`smoke:pages`, sobe o artefato e faz o deploy é
`_pages-build-deploy.yml`, chamado por `pages.yml` (push em `main`) e por
`update-data.yml` (commit de dados do bot) — ver `docs/infra/conventions.md`
§2.2. `.github/workflows/release.yml` só valida e cria/atualiza a GitHub
Release com as notas do `CHANGELOG.md`.

## 1. Definição de pronto

Uma versão está publicada quando **todos** os itens abaixo são verdadeiros:

| # | Verificação | Como conferir |
|---|---|---|
| 1 | `package.json.version` é a primeira versão publicada no CHANGELOG | `npx vitest run scripts/release-consistency.test.mjs` |
| 2 | O commit do bump está em `main` | `git log -1 --oneline origin/main` |
| 3 | A tag anotada `vX.Y.Z` existe no remoto e aponta para esse commit | `git ls-remote --tags origin vX.Y.Z` |
| 4 | O run `Release` da tag concluiu verde | `gh run list --workflow=release.yml --limit 1` |
| 5 | A release existe com o corpo igual à seção `[X.Y.Z]` | `gh release view vX.Y.Z --json tagName,name,url,body` |
| 6 | O Pages serve o build desse commit | `node scripts/check-deploy-freshness.mjs --expect-sha=$(git rev-parse HEAD) --strict` sai 0 |

Os itens 4–6 dependem de fila e de propagação de CDN; alguns minutos de
diferença são normais. A sonda do item 6 é a mesma do workflow
`data-freshness.yml` e sai 1 quando o bundle publicado é de outro commit, 2
quando não foi possível verificar (`docs/infra/conventions.md` §6).

## 2. Quando taggear (decisão D05)

**Tag só em marco visível ao usuário.** Vale tag quando o que o leitor vê ou
consome muda: funcionalidade nova, correção de cálculo publicada, mudança de
layout/navegação, remoção de integração. Não vale tag para refactor interno,
teste, CI ou documentação sem efeito no site.

**Commit de dados do bot nunca gera tag.** O `update-data.yml` commita
resultados várias vezes por dia; transformar cada coleta em release faria a
versão subir no ruído e a nota deixaria de descrever capacidade. O pacote de
dados tem prova própria — as sondas de frescor de `pages.yml` e
`data-freshness.yml` —, não a tag. Se a coleta mudar algo estrutural (novo
campo exibido, nova fonte), aí sim o marco é de produto e ganha versão.

## 3. Como fazer o bump

A versão é decidida pelo efeito no contrato público do site, não pelo tamanho
do diff:

| Bump | Quando | Exemplos |
|---|---|---|
| **PATCH** `X.Y.Z+1` | correção visível sem mudar contrato nem uso | bug de layout, texto errado, número calculado incorretamente |
| **MINOR** `X.Y+1.0` | funcionalidade ou comportamento novo, compatível | nova aba/análise, novo filtro, nova coluna |
| **MAJOR** `X+1.0.0` | quebra do contrato público | remoção de aba ou seção, mudança de semântica de um número publicado, URL/âncora compartilhada que deixa de existir |

Passos do bump:

1. `package.json`: troque `version` pela string exata (sem `^`/`~`; a política
   de dependências é a mesma, §8 de `docs/infra/conventions.md`).
2. `CHANGELOG.md`: mantenha `## [Unreleased]` (vazio é válido e o teste exige
   que ele exista) e insira `## [X.Y.Z] - YYYY-MM-DD` logo abaixo, movendo
   para lá as entradas que descrevem o marco. Data no formato real de
   calendário, sem literal em teste.
3. `npx vitest run scripts/release-consistency.test.mjs`: reprova se a
   primeira versão publicada divergir de `package.json` ou se a data for
   inválida. Bump sem CHANGELOG (e CHANGELOG sem bump) quebra aqui.

## 4. Sequência

```sh
# 1. Bump em package.json + seção no CHANGELOG.md (passos acima)

# 2. Gate local antes de criar a tag — evita run vermelho no remoto
npx vitest run scripts/release-consistency.test.mjs
npm test
GITHUB_PAGES=true npm run build && npm run smoke:pages

# 3. Commit do bump em main (o Pages publica esse commit)
git add package.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
git push git@github.com:ils15/brasileirao-2026.git HEAD:main

# 4. Tag anotada; o push dela dispara o workflow Release
git tag -a vX.Y.Z -m "vX.Y.Z — <resumo do marco>"
git push git@github.com:ils15/brasileirao-2026.git vX.Y.Z

# 5. Acompanhar e conferir
gh run list --workflow=release.yml --limit 1 --json databaseId,status,conclusion
gh release view vX.Y.Z --json tagName,name,url,body

# 6. Prova no site (após o deploy do commit propagar)
node scripts/check-deploy-freshness.mjs --expect-sha=$(git rev-parse HEAD) --strict --backoff=0,30000,120000
```

Push do commit **antes** da tag: a tag precisa apontar para um commit que
existe em `main`. Tag em commit não empurrado validaria um código que o Pages
não consegue buscar. O `pages.yml` não roda em push de tag (`branches: ['**']`),
então quem publica o site é o push do commit em `main`, não a tag.

## 5. Ensaio e reexecução

`workflow_dispatch` exige os inputs `tag` e `dry_run`; `dry_run` é `true` por
padrão:

```sh
gh workflow run release.yml -f tag=vX.Y.Z -f dry_run=true
```

O ensaio faz checkout da tag, valida tag↔versão, roda suíte, build e
`smoke:pages`, extrai as notas e as imprime no log e no resumo do run — sem
criar release. `dry_run=false` cria a release.

- **Idempotente:** se a release da tag já existe, o run edita as notas em vez
  de falhar. Reexecutar após corrigir o workflow é seguro.
- **As notas vêm do CHANGELOG dentro da tag.** Nota errada significa tag
  errada: publique um patch, não mova a tag (§6).
- **A tag precisa existir no remoto.** Em dispatch, o checkout usa
  `ref: inputs.tag`; uma tag inexistente falha na resolução da ref, antes da
  validação tag↔versão. Para provar o gate sem criar tag, use um clone
  descartável e a sequência local de `Validate tag against package version`.

## 6. Rollback

- **Nunca** `git tag -f`, nem apagar e reempurrar tag publicada. Consumidores
  e o workflow resolvem a tag pelo nome; movê-la faz a release e o build
  apontarem para commits diferentes com o mesmo rótulo.
- **Defeito no site:** reverta o comportamento com um novo commit em `main` e
  deixe o Pages publicar; a correção entra no próximo marco, ou num **PATCH**
  imediato se o defeito for visível.
- **Defeito no marco publicado:** publique um **PATCH** com a correção e
  marque a release anterior como pré-release, registrando o motivo na nota:
  ```sh
  gh release edit vX.Y.Z --prerelease --notes "Substituída por vX.Y.(Z+1): <motivo>."
  ```
- **Defeito no próprio workflow:** corrija `release.yml` em `main` e reexecute
  via dispatch sobre a tag existente com `dry_run=false`; o run edita a release
  existente e não toca na tag.
- **Release criada no lugar errado** (não deveria ocorrer: `--verify-tag`
  impede o `gh` de criar tag): apague só a release,
  `gh release delete vX.Y.Z --yes`, nunca a tag.

## 7. O que o workflow faz

| Ordem | Passo | Falha se |
|---|---|---|
| 1 | checkout da tag (`fetch-depth: 0`) | a tag não resolve no remoto |
| 2 | Node 24 + cache npm | — |
| 3 | valida `^v\d+\.\d+\.\d+$` e `${TAG#v} == package.json.version` | formato inválido ou versão divergente (`::error::`) |
| 4 | `npm ci` | lock divergente do manifesto |
| 5 | `npm test` | qualquer teste vermelho |
| 6 | `GITHUB_PAGES=true npm run build` + `npm run smoke:pages` | build ou assets do projeto quebrados |
| 7 | extrai `## [X.Y.Z]` até o próximo `## [` do CHANGELOG | seção ausente ou vazia |
| 8 | `gh release create --verify-tag` ou `gh release edit` | falta `contents: write` ou release inacessível |
| 9 | em `dry_run`, imprime as notas e encerra 0 | — |

O token é o `github.token` com `permissions: contents: write`; nenhum segredo
extra é necessário. O workflow é serializado em `concurrency: release` para que
duas execuções não disputem a mesma release.

## 8. Arquivos envolvidos

- `.github/workflows/release.yml` — este processo.
- `CHANGELOG.md` — fonte pública da versão e das notas.
- `scripts/release-consistency.test.mjs` — coerência versão↔CHANGELOG.
- `scripts/check-deploy-freshness.mjs` — prova de que o site serve o commit.
- `_pages-build-deploy.yml` — único publicador do site; não é chamado aqui.
