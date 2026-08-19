/**
 * Serializable descriptor for SQLite runtime configuration.
 *
 * Used to instruct the worker thread how to load or bind SQLite native drivers
 * across process and worker boundaries.
 */
export interface SqliteRuntimeDescriptor {
  /** Optional custom path or specifier to load the SQLite database module. */
  readonly modulePath?: string | undefined
}

/**
 *
 */
export interface SQLiteGraphStoreOptions {
  /** Optional serializable SQLite runtime descriptor. */
  readonly runtime?: SqliteRuntimeDescriptor | undefined
  /** Maximum number of concurrent in-flight/queued requests before rejecting with StoreOverloadError. Default is 256. */
  readonly maxPendingOperations?: number | undefined
}

/**
 * Internal options including worker path override for testing.
 */
export interface InternalSQLiteGraphStoreOptions extends SQLiteGraphStoreOptions {
  /** Optional worker script path override for testing. */
  readonly workerPath?: string | undefined
}
