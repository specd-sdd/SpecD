#!/usr/bin/env node
/**
 * Copies the Vite SPA from `apps/specd-studio-web/dist` into
 * `packages/plugin-ui-studio/dist`, then builds the bundle plugin loader (`index.js`).
 *
 * Run automatically at the end of `@specd/studio-web` `pnpm build`.
 * Version in `@specd/plugin-ui-studio` package.json + specd-plugin.json follows studio-web.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const studioWebRoot = path.resolve(here, '..')
const repoRoot = path.resolve(studioWebRoot, '../..')
const pluginRoot = path.join(repoRoot, 'packages/plugin-ui-studio')
const studioDist = path.join(studioWebRoot, 'dist')
const pluginDist = path.join(pluginRoot, 'dist')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function syncVersions(version) {
  const pluginPkgPath = path.join(pluginRoot, 'package.json')
  const manifestPath = path.join(pluginRoot, 'specd-plugin.json')
  const pluginPkg = readJson(pluginPkgPath)
  pluginPkg.version = version
  writeJson(pluginPkgPath, pluginPkg)

  const manifest = readJson(manifestPath)
  manifest.version = version
  writeJson(manifestPath, manifest)

  console.log(`@specd/plugin-ui-studio version → ${version} (from @specd/studio-web)`)
}

function copyStudioBundle() {
  const indexHtml = path.join(studioDist, 'index.html')
  if (!fs.existsSync(indexHtml)) {
    console.error(
      `Missing ${indexHtml}. Run vite build first (pnpm --filter @specd/studio-web exec vite build).`,
    )
    process.exit(1)
  }

  fs.mkdirSync(pluginDist, { recursive: true })

  for (const name of fs.readdirSync(pluginDist)) {
    if (name === 'index.js' || name === 'index.d.ts') continue
    const target = path.join(pluginDist, name)
    fs.rmSync(target, { recursive: true, force: true })
  }

  fs.copyFileSync(indexHtml, path.join(pluginDist, 'index.html'))

  const assetsDir = path.join(studioDist, 'assets')
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(pluginDist, 'assets'), { recursive: true, force: true })
  }

  console.log(`copied studio-web SPA → ${pluginDist}`)
}

function buildPluginLoader() {
  const result = spawnSync('pnpm', ['exec', 'tsup', 'src/index.ts', '--format', 'esm', '--dts'], {
    cwd: pluginRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const studioPkg = readJson(path.join(studioWebRoot, 'package.json'))
syncVersions(studioPkg.version)
copyStudioBundle()
buildPluginLoader()

console.log('plugin-ui-studio bundle ready')
