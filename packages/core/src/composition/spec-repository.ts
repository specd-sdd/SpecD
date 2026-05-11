import { type RepositoryConfig } from '../application/ports/repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { FsSpecRepository } from '../infrastructure/fs/spec-repository.js'

/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Repository configuration for spec repositories.
 *
 * Extends {@link RepositoryConfig} to allow providers to add adapter-specific
 * fields without coupling to the base type.
 */
export interface SpecRepositoryConfig extends RepositoryConfig {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/**
 * Filesystem adapter options for `createSpecRepository('fs', ...)`.
 */
export interface FsSpecRepositoryOptions {
  /** Absolute path to the specs root directory for this workspace. */
  readonly specsPath: string
  /** Optional logical path prefix for all specs in this workspace. */
  readonly prefix?: string
  /** Absolute path to the metadata root directory for this workspace. */
  readonly metadataPath: string
}

/**
 * Constructs a `SpecRepository` implementation for the given adapter type.
 *
 * Returns the abstract `SpecRepository` port type — callers never see the
 * concrete class.
 *
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param config - Repository configuration shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `SpecRepository` bound to the given workspace
 */
export function createSpecRepository(
  type: 'fs',
  config: SpecRepositoryConfig,
  options: FsSpecRepositoryOptions,
): SpecRepository {
  switch (type) {
    case 'fs':
      return new FsSpecRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        configPath: config.configPath,
        specsPath: options.specsPath,
        metadataPath: options.metadataPath,
        ...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
      })
  }
}
