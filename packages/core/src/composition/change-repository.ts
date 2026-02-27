import { type ChangeRepository } from '../application/ports/change-repository.js'
import { FsChangeRepository } from '../infrastructure/fs/change-repository.js'

/**
 * Discriminated union of all supported `ChangeRepository` adapter configurations.
 *
 * Each member carries a `type` discriminant and the fields required by that
 * adapter. New adapter types are added here without breaking existing callers.
 */
export type CreateChangeRepositoryConfig = {
  /** Adapter type discriminant. */
  readonly type: 'fs'
  /** The workspace name from `specd.yaml` (e.g. `"default"`, `"billing"`). */
  readonly workspace: string
  /** Ownership level of this repository instance. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether this repository points to data outside the current git root. */
  readonly isExternal: boolean
  /** Absolute path to the `changes/` directory for active changes. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory for shelved changes. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory for abandoned changes. */
  readonly discardedPath: string
  /**
   * Active schema name and version — emits a warning when a loaded manifest
   * records a different schema. Advisory only.
   */
  readonly activeSchema?: { name: string; version: number }
}

/**
 * Constructs a `ChangeRepository` implementation for the given adapter type.
 *
 * Returns the abstract `ChangeRepository` port type — callers never see the
 * concrete class.
 *
 * @param config - Discriminated union config identifying the adapter type and its options
 * @returns A fully constructed `ChangeRepository` bound to the given workspace
 */
export function createChangeRepository(config: CreateChangeRepositoryConfig): ChangeRepository {
  switch (config.type) {
    case 'fs':
      return new FsChangeRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        changesPath: config.changesPath,
        draftsPath: config.draftsPath,
        discardedPath: config.discardedPath,
        ...(config.activeSchema !== undefined ? { activeSchema: config.activeSchema } : {}),
      })
  }
}
