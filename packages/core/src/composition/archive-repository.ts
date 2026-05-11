import { type RepositoryConfig } from '../application/ports/repository.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { FsArchiveRepository } from '../infrastructure/fs/archive-repository.js'

/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Repository configuration for archive repositories.
 *
 * Extends {@link RepositoryConfig} to allow providers to add adapter-specific
 * fields without coupling to the base type.
 */
export interface ArchiveRepositoryConfig extends RepositoryConfig {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

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
 * @param config - Repository configuration shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `ArchiveRepository` bound to the given workspace
 */
export function createArchiveRepository(
  type: 'fs',
  config: ArchiveRepositoryConfig,
  options: FsArchiveRepositoryOptions,
): ArchiveRepository {
  switch (type) {
    case 'fs':
      return new FsArchiveRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        configPath: config.configPath,
        changesPath: options.changesPath,
        draftsPath: options.draftsPath,
        archivePath: options.archivePath,
        ...(options.pattern !== undefined ? { pattern: options.pattern } : {}),
      })
  }
}
