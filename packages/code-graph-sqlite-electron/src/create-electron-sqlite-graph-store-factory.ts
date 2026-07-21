import { createSqliteGraphStoreFactory, type GraphStoreFactory } from '@specd/code-graph'
import { loadVendoredBetterSqlite3Module } from './runtime/load-vendored-better-sqlite3.js'

/**
 * Creates a reusable SQLite graph-store factory for Electron hosts.
 *
 * Registers under the additive backend id `sqlite-electron` via SDK/host
 * `graphStoreFactories`. Does not overwrite the built-in `sqlite` backend.
 *
 * @returns A {@link GraphStoreFactory} that injects the Electron-vendored loader.
 */
export function createElectronSqliteGraphStoreFactory(): GraphStoreFactory {
  return createSqliteGraphStoreFactory({
    loadDatabaseModule: loadVendoredBetterSqlite3Module,
  })
}
