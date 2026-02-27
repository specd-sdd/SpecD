import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { FsArchiveRepository } from '../infrastructure/fs/archive-repository.js'

/**
 * Discriminated union of all supported `ArchiveRepository` adapter configurations.
 *
 * Each member carries a `type` discriminant and the fields required by that
 * adapter. New adapter types are added here without breaking existing callers.
 */
export type CreateArchiveRepositoryConfig = {
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
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /**
   * Optional pattern controlling the archive directory structure.
   *
   * Supported variables: `{{year}}`, `{{month}}`, `{{day}}`,
   * `{{change.name}}`, `{{change.archivedName}}`. Defaults to
   * `{{change.archivedName}}`.
   */
  readonly pattern?: string
}

/**
 * Constructs an `ArchiveRepository` implementation for the given adapter type.
 *
 * Returns the abstract `ArchiveRepository` port type — callers never see the
 * concrete class.
 *
 * @param config - Discriminated union config identifying the adapter type and its options
 * @returns A fully constructed `ArchiveRepository` bound to the given workspace
 */
export function createArchiveRepository(config: CreateArchiveRepositoryConfig): ArchiveRepository {
  switch (config.type) {
    case 'fs':
      return new FsArchiveRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        changesPath: config.changesPath,
        draftsPath: config.draftsPath,
        archivePath: config.archivePath,
        ...(config.pattern !== undefined ? { pattern: config.pattern } : {}),
      })
  }
}
