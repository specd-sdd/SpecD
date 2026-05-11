import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type ArchiveRepositoryConfig } from './archive-repository.js'

/**
 * Factory for archive repositories registered under a named adapter key.
 */
export interface ArchiveStorageFactory {
  /**
   * Creates an archive repository for the default workspace configuration.
   *
   * @param config - Shared repository configuration for the default workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed archive repository implementation
   */
  create(
    config: ArchiveRepositoryConfig,
    options: Readonly<Record<string, unknown>>,
  ): ArchiveRepository
}
