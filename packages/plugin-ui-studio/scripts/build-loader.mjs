#!/usr/bin/env node
/**
 * Builds only `dist/index.js` (does not wipe SPA assets).
 * Requires `dist/index.html` from {@link ../../../apps/specd-studio-web/scripts/sync-plugin-ui-studio.mjs}.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexHtml = path.join(pkgRoot, 'dist', 'index.html')

if (!fs.existsSync(indexHtml)) {
  console.error(
    'plugin-ui-studio: dist/index.html missing.\n' +
      'Build the Studio SPA first:\n' +
      '  pnpm --filter @specd/studio-web build\n',
  )
  process.exit(1)
}

const result = spawnSync('pnpm', ['exec', 'tsup', 'src/index.ts', '--format', 'esm', '--dts'], {
  cwd: pkgRoot,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
