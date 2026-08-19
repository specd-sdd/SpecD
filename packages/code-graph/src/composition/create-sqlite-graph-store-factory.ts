import { type GraphStoreFactory } from './graph-store-factory.js'
import { SQLiteGraphStore } from '../infrastructure/sqlite/sqlite-graph-store.js'
import { type SqliteRuntimeDescriptor } from '../infrastructure/sqlite/sqlite-runtime-descriptor.js'

/**
 * Options for reusable SQLite graph-store construction.
 */
export interface SqliteGraphStoreFactoryOptions {
  /** Optional serializable SQLite runtime descriptor. */
  readonly runtime?: SqliteRuntimeDescriptor | undefined
  /** Maximum number of concurrent in-flight/queued requests before rejecting with StoreOverloadError. */
  readonly maxPendingOperations?: number | undefined
  /** Optional worker script path override. */
  readonly workerPath?: string | undefined
}

/**
 * Creates a reusable SQLite-backed graph-store factory.
 *
 * @param factoryOptions - Optional runtime-specific SQLite configuration overrides.
 * @returns A graph-store factory that constructs {@link SQLiteGraphStore}.
 */
export function createSqliteGraphStoreFactory(
  factoryOptions?: SqliteGraphStoreFactoryOptions,
): GraphStoreFactory {
  return {
    create(graphStoreOptions) {
      return new SQLiteGraphStore(graphStoreOptions.storagePath, {
        runtime: factoryOptions?.runtime,
        maxPendingOperations: factoryOptions?.maxPendingOperations,
        workerPath: factoryOptions?.workerPath,
      })
    },
  }
}
