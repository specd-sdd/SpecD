/**
 * Exclusive keyset cursor for paginated repository lists.
 *
 * `key` is the sort-key value in canonical order (ISO timestamp for time-sorted
 * buckets; capability path for specs). `id` is an optional tiebreak (change
 * `name` for change/archive buckets; omit for specs).
 */
export interface ListCursor {
  readonly key: string
  readonly id?: string
}

/**
 * Shared pagination options for listable repository ports.
 *
 * - `limit` defaults to **100** when omitted.
 * - `page` is 1-based and mutually exclusive with `after`.
 * - `after` continues strictly after the cursor position in canonical sort order.
 */
export interface ListOptions {
  readonly limit?: number
  readonly page?: number
  readonly after?: ListCursor
}

/**
 * Metadata returned with every paginated list result.
 */
export interface ListMeta {
  readonly total: number
  readonly count: number
  readonly limit: number
  readonly page?: number
  readonly after?: ListCursor
}

/**
 * Uniform paginated list envelope used by listable repository ports.
 */
export interface ListResult<T> {
  readonly items: readonly T[]
  readonly meta: ListMeta
}

/**
 * Construction properties shared by all repository implementations.
 */
export interface RepositoryConfig {
  /** The workspace name from `specd.yaml` (e.g. `"billing"`, `"default"`). */
  readonly workspace: string
  /**
   * The ownership level of this repository.
   *
   * - `owned` — full control, no restrictions
   * - `shared` — writes allowed but recorded in the change manifest as `touchedSharedSpecs`
   * - `readOnly` — no writes allowed; data may only be read, never modified
   */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /**
   * Whether this repository points to data outside the current git repository.
   *
   * External repositories may not be accessible to agents restricted to the
   * current git root, and may in future be resolved over a network rather than
   * the local filesystem.
   */
  readonly isExternal: boolean
  /**
   * Absolute path to the config directory.
   *
   * Used for derived paths such as change locks, graph persistence, etc.
   */
  readonly configPath: string
}

/**
 * Base class for all repository ports.
 *
 * Encapsulates the three invariants shared by every repository implementation:
 * workspace, ownership, and locality. Subclasses declare their storage operations
 * as `abstract` methods.
 */
export abstract class Repository {
  private readonly _workspace: string
  private readonly _ownership: 'owned' | 'shared' | 'readOnly'
  private readonly _isExternal: boolean
  private readonly _configPath: string

  /**
   * Creates a new `Repository` instance.
   *
   * @param config - Workspace, ownership, locality, and config path for this repository
   */
  constructor(config: RepositoryConfig) {
    this._workspace = config.workspace
    this._ownership = config.ownership
    this._isExternal = config.isExternal
    this._configPath = config.configPath
  }

  /**
   * Returns the workspace name this repository is bound to.
   *
   * @returns The workspace name (e.g. `"billing"`, `"default"`)
   */
  workspace(): string {
    return this._workspace
  }

  /**
   * Returns the ownership level of this repository, as declared in `specd.yaml`.
   *
   * @returns The ownership level
   */
  ownership(): 'owned' | 'shared' | 'readOnly' {
    return this._ownership
  }

  /**
   * Returns whether this repository points to data outside the current git repository.
   *
   * @returns `true` if this repository is external to the current git root
   */
  isExternal(): boolean {
    return this._isExternal
  }

  /**
   * Returns the absolute path to the config directory.
   *
   * @returns The config path (e.g. `/project/.specd/config`)
   */
  configPath(): string {
    return this._configPath
  }

  /**
   * Resets whatever this adapter caches.
   *
   * Default is a no-op. Filesystem adapters override to invalidate list-index
   * helpers. Callers that know the on-disk tree changed outside the repository
   * MAY invoke this without knowing adapter-specific cache details.
   */
  async invalidateCache(): Promise<void> {
    // default no-op
  }
}
