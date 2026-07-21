import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(testDir, '..', '..')
const repoRoot = path.resolve(packageRoot, '..', '..')

describe('vendored sqlite paths', () => {
  it('ignores the generated vendor tree in git', () => {
    const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')

    expect(gitignore).toContain('packages/code-graph-sqlite-electron/vendor/')
  })

  it('resolves vendor paths under this package only', async () => {
    const { vendoredSqlitePackageRoot, vendoredSqliteEntry, vendoredSqliteBinaryPath } =
      await import('../../src/runtime/load-vendored-better-sqlite3.js')

    expect(vendoredSqlitePackageRoot).toContain('code-graph-sqlite-electron/vendor/better-sqlite3')
    expect(vendoredSqlitePackageRoot).not.toContain('code-graph-electron/vendor')
    expect(vendoredSqliteEntry).toContain(
      'code-graph-sqlite-electron/vendor/better-sqlite3/lib/index.js',
    )
    expect(vendoredSqliteBinaryPath).toContain(
      'code-graph-sqlite-electron/vendor/better-sqlite3/build/Release/better_sqlite3.node',
    )
  })

  it('resolves the same vendor paths from the bundled dist entry', async () => {
    const { vendoredSqlitePackageRoot, vendoredSqliteEntry } = await import('../../dist/index.js')

    expect(vendoredSqlitePackageRoot).toContain('code-graph-sqlite-electron/vendor/better-sqlite3')
    expect(vendoredSqlitePackageRoot).not.toMatch(/packages\/vendor\//)
    expect(vendoredSqliteEntry).toBe(path.join(packageRoot, 'vendor/better-sqlite3/lib/index.js'))
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
  })
})

describe('createElectronSqliteGraphStoreFactory', () => {
  it('constructs a factory without loading the native addon', async () => {
    const loadSpy = vi.fn()
    vi.doMock('../../src/runtime/load-vendored-better-sqlite3.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../src/runtime/load-vendored-better-sqlite3.js')
      >('../../src/runtime/load-vendored-better-sqlite3.js')
      return {
        ...actual,
        loadVendoredBetterSqlite3Module: loadSpy,
      }
    })

    const { createElectronSqliteGraphStoreFactory } =
      await import('../../src/create-electron-sqlite-graph-store-factory.js')
    const factory = createElectronSqliteGraphStoreFactory()

    expect(factory).toHaveProperty('create')
    expect(typeof factory.create).toBe('function')
    expect(loadSpy).not.toHaveBeenCalled()

    vi.doUnmock('../../src/runtime/load-vendored-better-sqlite3.js')
  })

  it('exports factory from package barrel', async () => {
    const builtDts = readFileSync(path.join(packageRoot, 'dist/index.d.ts'), 'utf8')
    const builtJs = readFileSync(path.join(packageRoot, 'dist/index.js'), 'utf8')

    expect(builtDts).toContain('createElectronSqliteGraphStoreFactory')
    expect(builtDts).toContain('vendoredSqlitePackageRoot')
    expect(builtJs).toContain('vendor/better-sqlite3')
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
})
