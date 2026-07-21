import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Runtime-loadable SQLite module shape matching `createSqliteGraphStoreFactory`. */
export interface VendoredSqliteDatabaseModule {
  readonly default: new (path: string, options?: { readonly?: boolean | undefined }) => unknown
}

const PACKAGE_NAME = '@specd/code-graph-sqlite-electron'

/**
 * Resolves this package root from either source (`src/runtime/…`) or the bundled
 * `dist/index.js` entry — fixed relative hops break after tsup bundles to `dist/`.
 *
 * @param startDir - Directory to begin walking upward from (usually the module dir)
 * @returns Absolute path to the `@specd/code-graph-sqlite-electron` package root
 * @throws When no matching `package.json` is found walking to the filesystem root
 */
function resolvePackageRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    const pkgPath = path.join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg.name === PACKAGE_NAME) {
          return dir
        }
      } catch {
        // Keep walking if package.json is unreadable or invalid.
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`Could not resolve package root for ${PACKAGE_NAME} from ${startDir}`)
    }
    dir = parent
  }
}

const packageRoot = resolvePackageRoot(path.dirname(fileURLToPath(import.meta.url)))

/** Absolute path to this package's vendored better-sqlite3 root. */
export const vendoredSqlitePackageRoot = path.resolve(packageRoot, 'vendor/better-sqlite3')

/** Absolute path to the vendored better-sqlite3 JS entry. */
export const vendoredSqliteEntry = path.resolve(vendoredSqlitePackageRoot, 'lib/index.js')

/** Absolute path to the Electron-rebuilt native addon. */
export const vendoredSqliteBinaryPath = path.resolve(
  vendoredSqlitePackageRoot,
  'build/Release/better_sqlite3.node',
)

/**
 * Loads the Electron-vendored better-sqlite3 module.
 *
 * Native loading is deferred until this function runs (typically during store `open()`).
 *
 * @returns Module shape expected by `createSqliteGraphStoreFactory`.
 */
export function loadVendoredBetterSqlite3Module(): Promise<VendoredSqliteDatabaseModule> {
  const require = createRequire(import.meta.url)
  const Database = require(vendoredSqliteEntry) as VendoredSqliteDatabaseModule['default']
  return Promise.resolve({ default: Database })
}
