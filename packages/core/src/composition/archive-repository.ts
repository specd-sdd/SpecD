import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { FsArchiveRepository } from '../infrastructure/fs/archive-repository.js'

/**
 * Domain context shared by all `ArchiveRepository` adapter types.
 *
 * These fields belong to the port contract and are independent of the
 * underlying storage technology.
 */
export interface ArchiveRepositoryContext {
  /** The workspace name from `specd.yaml` (e.g. `"default"`, `"billing"`). */
  readonly workspace: string
  /** Ownership level of this repository instance. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether this repository points to data outside the current git root. */
  readonly isExternal: boolean
  /** Absolute path to the config directory. */
  readonly configPath: string
}

/**
 * Filesystem adapter options for `createArchiveRepository('fs', ...)`.
 */
export interface FsArchiveRepositoryOptions {
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
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param context - Domain context shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `ArchiveRepository` bound to the given workspace
 */
export function createArchiveRepository(
  type: 'fs',
  context: ArchiveRepositoryContext,
  options: FsArchiveRepositoryOptions,
): ArchiveRepository {
  switch (type) {
    case 'fs':
      return new FsArchiveRepository({
        workspace: context.workspace,
        ownership: context.ownership,
        isExternal: context.isExternal,
        configPath: context.configPath,
        changesPath: options.changesPath,
        draftsPath: options.draftsPath,
        archivePath: options.archivePath,
        ...(options.pattern !== undefined ? { pattern: options.pattern } : {}),
      })
  }
}
