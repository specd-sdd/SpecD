import { type SpecdConfig } from '../application/specd-config.js'
import {
  type SpecRepository,
  type SpecRepositoryConfig,
} from '../application/ports/spec-repository.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from './composition-resolver.js'
import { createBuiltinCompositionRegistry, mergeNamedRegistry } from './composition-registries.js'
import { type SpecStorageFactory } from './spec-storage-factory.js'
import { UnknownAdapterError } from '../domain/errors/index.js'
import {
  FsSpecRepository,
  type FsSpecRepositoryConfig,
} from '../infrastructure/fs/spec-repository.js'

/**
 * Constructs the default workspace `SpecRepository` implementation from config.
 *
 * @param config - Resolved project configuration
 * @param options - Additive composition options
 * @returns A fully constructed `SpecRepository` for the default workspace
 */
export function createSpecRepository(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SpecRepository

/**
 * Constructs a `SpecRepository` implementation for the given adapter type.
 *
 * @param type - Adapter type discriminant
 * @param context - Repository context
 * @param config - Adapter options
 * @param extra - Optional extra factory registrations
 * @param extra.specStorageFactories - Optional map of spec storage factories
 * @returns A fully constructed `SpecRepository`
 */
export function createSpecRepository(
  type: string,
  context: SpecRepositoryConfig,
  config: Record<string, unknown>,
  extra?: { specStorageFactories?: Record<string, SpecStorageFactory> },
): SpecRepository

/**
 * Main implementation of createSpecRepository.
 *
 * @param args - Overloaded arguments
 * @returns A fully constructed SpecRepository
 * @throws {@link UnknownAdapterError} When adapter type is not registered
 */
export function createSpecRepository(...args: unknown[]): SpecRepository {
  if (
    args.length === 1 ||
    (args.length === 2 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !('workspace' in args[0]))
  ) {
    // Config-based: delegates to CompositionResolver
    const [config, options] = args as [SpecdConfig, CompositionResolutionOptions?]
    const resolver = createCompositionResolver(config, options)
    return resolver.getSpecRepositories().get('default')!
  }

  // Direct / Registry-based lookup
  const [type, context, config, extra] = args as [
    string,
    SpecRepositoryConfig,
    Record<string, unknown>,
    { specStorageFactories?: Record<string, SpecStorageFactory> }?,
  ]
  const builtin = createBuiltinCompositionRegistry()
  const merged = mergeNamedRegistry(
    'specStorageFactories',
    builtin.specStorageFactories ?? {},
    extra?.specStorageFactories,
  )

  const factory = merged.get(type)
  if (!factory) {
    throw new UnknownAdapterError(type, 'spec')
  }

  return factory.create(context, config)
}

/**
 * Creates a factory for filesystem-backed spec repositories.
 *
 * @returns A `SpecStorageFactory` instance.
 */
export function createFsSpecStorageFactory(): SpecStorageFactory {
  return {
    create(context: SpecRepositoryConfig, config: Record<string, unknown>): SpecRepository {
      return new FsSpecRepository(context, config as unknown as FsSpecRepositoryConfig)
    },
  }
}

export type { SpecRepositoryConfig } from '../infrastructure/fs/spec-repository.js'
export type { FsSpecRepositoryConfig } from '../infrastructure/fs/spec-repository.js'
