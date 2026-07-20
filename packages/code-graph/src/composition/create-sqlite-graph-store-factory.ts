import { type GraphStoreFactory } from './graph-store-factory.js'
import { SQLiteGraphStore } from '../infrastructure/sqlite/sqlite-graph-store.js'

/**
 * Runtime-loadable SQLite module shape.
 */
export interface SqliteDatabaseModule {
  readonly default: new (path: string, options?: { readonly?: boolean | undefined }) => unknown
}

/**
 * Options for reusable SQLite graph-store construction.
 */
export interface SqliteGraphStoreFactoryOptions {
  /** Optional runtime-specific loader for the SQLite database module. */
  readonly loadDatabaseModule?: (() => Promise<SqliteDatabaseModule>) | undefined
}

/**
 * Creates a reusable SQLite-backed graph-store factory.
 *
 * @param factoryOptions - Optional runtime-specific SQLite loader overrides.
 * @returns A graph-store factory that constructs {@link SQLiteGraphStore}.
 */
export function createSqliteGraphStoreFactory(
  factoryOptions?: SqliteGraphStoreFactoryOptions,
): GraphStoreFactory {
  return {
    create(graphStoreOptions) {
      return new SQLiteGraphStore(graphStoreOptions.storagePath, {
        loadDatabaseModule: factoryOptions?.loadDatabaseModule,
      })
    },
  }
}
