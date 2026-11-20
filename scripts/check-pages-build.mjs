import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const basePath = '/brasileirao-2026/'
const outputDirectory = resolve('dist')

// Rebuild in the same invocation: a pre-existing dist/ may come from a build
// with another base (e.g. '/'), and validating it would prove nothing about
// what gets published. Any failure here must abort before the artifact checks.
const build = spawnSync('npm run build', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, GITHUB_PAGES: 'true' },
})

if (build.error || build.status !== 0) {
  const reason = build.error?.message ?? `exit code ${build.status}`
  throw new Error(`GITHUB_PAGES=true npm run build failed (${reason})`)
}

const html = await readFile(join(outputDirectory, 'index.html'), 'utf8')
const assetPaths = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)].map((match) => match[1])

if (assetPaths.length === 0) {
  throw new Error('No JavaScript or CSS assets were found in dist/index.html')
}

for (const assetPath of assetPaths) {
  if (!assetPath.startsWith(basePath)) {
    throw new Error(`HTML asset is not under ${basePath}: ${assetPath}`)
  }
  await readFile(join(outputDirectory, assetPath.slice(basePath.length)))
}

// O favicon vem de public/ e não entra na varredura de .js/.css acima: um href
// sem o base path (ou um arquivo não copiado) só apareceria como 404 no
// navegador, justamente o que este smoke existe para impedir.
const linkTags = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => match[0])
const iconTag = linkTags.find((tag) => /\brel="icon"/.test(tag))
if (!iconTag) {
  throw new Error('dist/index.html does not declare a favicon link')
}

const iconHref = iconTag.match(/href="([^"]+)"/)?.[1]
if (!iconHref) {
  throw new Error(`Favicon link has no href: ${iconTag}`)
}
if (!iconHref.startsWith(basePath)) {
  throw new Error(`Favicon is not under ${basePath}: ${iconHref}`)
}

let iconSource
try {
  iconSource = await readFile(join(outputDirectory, iconHref.slice(basePath.length)), 'utf8')
} catch {
  throw new Error(`Favicon referenced by dist/index.html is missing: ${iconHref}`)
}
if (!iconSource.trimStart().startsWith('<svg')) {
  throw new Error(`Favicon is not an SVG document: ${iconHref}`)
}

const scriptPaths = assetPaths.filter((assetPath) => assetPath.endsWith('.js'))
if (scriptPaths.length === 0) {
  throw new Error('No JavaScript entry asset was found in dist/index.html')
}

// O Vite pode dividir o app em chunks compartilhados carregados por
// `modulepreload`; o `new Worker(new URL(...))` fica no chunk que importa o
// provider, não necessariamente no entry. Varra todos os JS declarados no HTML.
let workerPath = null
for (const scriptPath of scriptPaths) {
  const source = await readFile(join(outputDirectory, scriptPath.slice(basePath.length)), 'utf8')
  const match = source.match(/["'`]([^"'`]*projection\.worker-[^"'`]+\.js)["'`]/)
  if (match) {
    workerPath = match[1]
    break
  }
}

if (!workerPath) {
  throw new Error('The emitted JavaScript does not reference the projection Web Worker')
}

if (!workerPath.startsWith(basePath)) {
  throw new Error(`Web Worker is not under ${basePath}: ${workerPath}`)
}
await readFile(join(outputDirectory, workerPath.slice(basePath.length)))

console.log(`GitHub Pages asset smoke test passed: HTML assets, favicon and worker resolve under ${basePath}`)
