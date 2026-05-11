import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SpecRepositoryConfig } from './spec-repository.js'

/**
 * Factory for workspace spec repositories registered under a named adapter key.
 */
export interface SpecStorageFactory {
  /**
   * Creates a spec repository for the given workspace configuration.
   *
   * @param config - Shared repository configuration for the target workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed spec repository implementation
   */
  create(config: SpecRepositoryConfig, options: Readonly<Record<string, unknown>>): SpecRepository
}
