import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceDir = path.resolve(packageDir, '..')
const desktopDir = path.resolve(workspaceDir, '../../apps/specd-studio-desktop')
const syncScriptPath = path.resolve(packageDir, 'sync-vendored-sqlite.mjs')
const vendorDir = path.resolve(workspaceDir, 'vendor/better-sqlite3')
const vendorBinaryPath = path.resolve(vendorDir, 'build/Release/better_sqlite3.node')
const metadataPath = path.resolve(vendorDir, '.electron-build.json')
const electronPackageJsonPath = require.resolve('electron/package.json', {
  paths: [desktopDir],
})
const { version: electronVersion } = require(electronPackageJsonPath)
const nodeExecutable = process.execPath
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const syncResult = spawnSync(nodeExecutable, [syncScriptPath], {
  cwd: workspaceDir,
  stdio: 'inherit',
})

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1)
}

if (existsSync(metadataPath)) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  if (
    metadata.electronVersion === electronVersion
    && metadata.binaryPath === vendorBinaryPath
    && existsSync(vendorBinaryPath)
  ) {
    process.exit(0)
  }
}

const result = spawnSync(npmExecutable, ['rebuild'], {
  cwd: vendorDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_build_from_source: 'true',
  },
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

writeFileSync(
  metadataPath,
  `${JSON.stringify(
    {
      electronVersion,
      binaryPath: vendorBinaryPath,
    },
    null,
    2,
  )}\n`,
  'utf8',
)
