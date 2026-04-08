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
 * Factory contract for creating a concrete graph-store backend by id.
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
export interface CodeGraphFactoryOptions {
  /** Selected backend id; when omitted, the built-in default is used. */
  readonly graphStoreId?: string
  /** Additional graph-store factories merged additively with the built-ins. */
  readonly graphStoreFactories?: Readonly<Record<string, GraphStoreFactory>>
  /** Additional language adapters to register beyond the built-ins. */
  readonly adapters?: readonly LanguageAdapter[]
}

/**
 * Legacy standalone provider-construction options.
 */
export interface CodeGraphOptions extends CodeGraphFactoryOptions {
  /** Filesystem root allocated to the selected graph-store backend. */
  readonly storagePath: string
}
