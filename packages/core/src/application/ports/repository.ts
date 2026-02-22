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

  /**
   * @param config - Workspace, ownership, and locality configuration for this repository
   */
  constructor(config: RepositoryConfig) {
    this._workspace = config.workspace
    this._ownership = config.ownership
    this._isExternal = config.isExternal
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
}
