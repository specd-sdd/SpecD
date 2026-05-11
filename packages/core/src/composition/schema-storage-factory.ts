import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { type SchemaRepositoryConfig } from './schema-repository.js'

/**
 * Factory for workspace schema repositories registered under a named adapter key.
 */
export interface SchemaStorageFactory {
  /**
   * Creates a schema repository for the given workspace configuration.
   *
   * @param config - Shared repository configuration for the target workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed schema repository implementation
   */
  create(
    config: SchemaRepositoryConfig,
    options: Readonly<Record<string, unknown>>,
  ): SchemaRepository
}
