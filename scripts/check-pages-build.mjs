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

const mainBundlePath = assetPaths.find((assetPath) => assetPath.endsWith('.js'))
if (!mainBundlePath) {
  throw new Error('No JavaScript entry asset was found in dist/index.html')
}

const mainBundle = await readFile(join(outputDirectory, mainBundlePath.slice(basePath.length)), 'utf8')
const workerMatch = mainBundle.match(/["'`]([^"'`]*projection\.worker-[^"'`]+\.js)["'`]/)
if (!workerMatch) {
  throw new Error('The emitted JavaScript does not reference the projection Web Worker')
}

const workerPath = workerMatch[1]
if (!workerPath.startsWith(basePath)) {
  throw new Error(`Web Worker is not under ${basePath}: ${workerPath}`)
}
await readFile(join(outputDirectory, workerPath.slice(basePath.length)))

console.log(`GitHub Pages asset smoke test passed: HTML assets and worker resolve under ${basePath}`)
