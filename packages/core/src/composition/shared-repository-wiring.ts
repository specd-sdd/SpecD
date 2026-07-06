import { type SpecdConfig } from '../application/specd-config.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from './composition-resolver.js'

/**
 * Options for mapping spec repositories.
 */
export interface SharedSpecRepositoryMapOptions {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
  /** Optional additive composition registrations for adapter resolution. */
  readonly options?: CompositionResolutionOptions
}

/**
 * Options for constructing a change repository.
 */
export interface SharedChangeRepositoryOptions {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
  /** Optional additive composition registrations for adapter resolution. */
  readonly options?: CompositionResolutionOptions
}

/**
 * Creates and returns a map of all configured spec repositories.
 *
 * @param options - Mapping options containing config
 * @returns Map of spec repositories keyed by workspace name
 */
export function createSharedSpecRepositories(
  options: SharedSpecRepositoryMapOptions,
): ReadonlyMap<string, SpecRepository> {
  return createCompositionResolver(options.config, options.options).getSpecRepositories()
}

/**
 * Creates and returns the default change repository initialized with canonical schema and spec resolvers.
 *
 * @param options - Construction options containing config
 * @returns Initialized ChangeRepository instance
 */
export function createSharedChangeRepository(
  options: SharedChangeRepositoryOptions,
): ChangeRepository {
  return createCompositionResolver(options.config, options.options).getChangeRepository()
}
