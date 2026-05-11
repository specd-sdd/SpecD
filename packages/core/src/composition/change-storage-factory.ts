import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ChangeRepositoryConfig } from './change-repository.js'

/**
 * Factory for change repositories registered under a named adapter key.
 */
export interface ChangeStorageFactory {
  /**
   * Creates a change repository for the default workspace configuration.
   *
   * @param config - Shared repository configuration for the default workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed change repository implementation
   */
  create(
    config: ChangeRepositoryConfig,
    options: Readonly<Record<string, unknown>>,
  ): ChangeRepository
}
