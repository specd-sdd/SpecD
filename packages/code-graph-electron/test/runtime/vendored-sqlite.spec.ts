import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(testDir, '..', '..')
const repoRoot = path.resolve(packageRoot, '..', '..')

describe('vendored sqlite runtime', () => {
  it('ignores the generated vendor tree in git', () => {
    const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')

    expect(gitignore).toContain('packages/code-graph-electron/vendor/')
  })

  it('keeps a physically separate sqlite tree with matching package versions', async () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const vendoredPackageJson = JSON.parse(
      readFileSync(path.join(packageRoot, 'vendor/better-sqlite3/package.json'), 'utf8'),
    ) as { version: string }
    const canonicalVersion = packageJson.dependencies['better-sqlite3']

    expect(canonicalVersion).toBeDefined()
    expect(vendoredPackageJson.version).toBe(canonicalVersion?.replace(/^\^/, ''))
    expect(existsSync(path.join(packageRoot, 'vendor/better-sqlite3/lib/index.js'))).toBe(true)
    expect(
      existsSync(
        path.join(packageRoot, 'vendor/better-sqlite3/node_modules/bindings/package.json'),
      ),
    ).toBe(true)
    expect(
      existsSync(
        path.join(packageRoot, 'vendor/better-sqlite3/node_modules/file-uri-to-path/package.json'),
      ),
    ).toBe(true)
  })

  it('exports vendored runtime paths from the built package surface', async () => {
    const builtJs = readFileSync(path.join(packageRoot, 'dist/index.js'), 'utf8')
    const builtDts = readFileSync(path.join(packageRoot, 'dist/index.d.ts'), 'utf8')

    expect(builtDts).toContain('vendoredSqlitePackageRoot')
    expect(builtDts).toContain('vendoredSqliteEntry')
    expect(builtDts).toContain('vendoredSqliteBinaryPath')
    expect(builtJs).toContain('vendor/better-sqlite3')
    expect(builtJs).toContain('build/Release/better_sqlite3.node')
  })
})

describe('portable electron build metadata', () => {
  it('uses portable rebuild cache fields in the electron rebuild script', () => {
    const rebuildScript = readFileSync(
      path.join(packageRoot, 'scripts/rebuild-vendored-sqlite-electron.mjs'),
      'utf8',
    )

    expect(rebuildScript).toContain('createPortableElectronBuildMetadata')
    expect(rebuildScript).toContain('parsePortableElectronBuildMetadata')
    expect(rebuildScript).toContain('process.platform')
    expect(rebuildScript).toContain('process.arch')
    expect(rebuildScript).not.toContain('binaryPath')
  })

  it('preserves only portable metadata during vendored sqlite sync', () => {
    const syncScript = readFileSync(
      path.join(packageRoot, 'scripts/sync-vendored-sqlite.mjs'),
      'utf8',
    )

    expect(syncScript).toContain('parsePortableElectronBuildMetadata')
  })
})
