import { type LanguageAdapter } from '../domain/value-objects/language-adapter.js'
import { type GraphStore } from '../domain/ports/graph-store.js'

/**
 * Construction-time options passed to a concrete graph-store factory.
 */
export interface GraphStoreFactoryOptions {
  /** Root path that owns the graph/ and tmp/ directories for the backend. */
  readonly storagePath: string
}

/**
 * Factory contract for an additive graph-store backend registration.
 *
 * SQLite remains the sole built-in and default backend. External factories may
 * be selected explicitly, but this seam is not yet a stable plugin API.
 */
export interface GraphStoreFactory {
  /**
   * Creates a concrete graph-store backend for the provided storage root.
   *
   * @param options - Backend construction options.
   * @returns A concrete {@link GraphStore} implementation.
   */
  create(options: GraphStoreFactoryOptions): GraphStore
}

/**
 * Optional composition overrides for the primary `SpecdConfig` factory overload.
 */
export interface CodeGraphCompositionOptions {
  /** Selected backend id; when omitted, the built-in SQLite backend is used. */
  readonly graphStoreId?: string
  /** Additional factories merged additively; they cannot override SQLite. */
  readonly graphStoreFactories?: Readonly<Record<string, GraphStoreFactory>>
  /** Additional language adapters to register beyond the built-ins. */
  readonly adapters?: readonly LanguageAdapter[]
}

/**
 * Legacy standalone provider-construction options.
 */
export interface CodeGraphOptions extends CodeGraphCompositionOptions {
  /** Filesystem root allocated to the selected graph-store backend. */
  readonly storagePath: string
  /** Optional project root used for selector normalization. */
  readonly projectRoot?: string
}
