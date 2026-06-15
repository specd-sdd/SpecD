import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import type { Statement } from 'better-sqlite3'

const require = createRequire(import.meta.url)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const vendoredSqlitePackageRoot = path.resolve(packageRoot, 'vendor/better-sqlite3')
export const vendoredSqliteEntry = path.resolve(vendoredSqlitePackageRoot, 'lib/index.js')
export const vendoredSqliteBinaryPath = path.resolve(
  vendoredSqlitePackageRoot,
  'build/Release/better_sqlite3.node',
)

const VendoredDatabase = require(vendoredSqliteEntry) as typeof Database

// eslint-disable-next-line no-restricted-syntax
export default VendoredDatabase
export type { Statement }
