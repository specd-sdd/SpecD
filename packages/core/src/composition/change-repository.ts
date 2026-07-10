import { type SpecdConfig } from '../application/specd-config.js'
import {
  type ChangeRepository,
  type ChangeRepositoryConfig,
} from '../application/ports/change-repository.js'
import { type RepositoryConfig } from '../application/ports/repository.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from './composition-resolver.js'
import { createBuiltinCompositionRegistry, mergeNamedRegistry } from './composition-registries.js'
import { type ChangeStorageFactory } from './change-storage-factory.js'
import { UnknownAdapterError } from '../domain/errors/index.js'
import {
  FsChangeRepository,
  type ChangeRepositoryConfig as FsChangeRepositoryConfigExtended,
  type FsChangeRepositoryConfig,
} from '../infrastructure/fs/change-repository.js'

/**
 * Constructs a `ChangeRepository` implementation from config.
 *
 * @param config - Resolved project configuration
 * @param options - Additive composition options
 * @returns A fully constructed `ChangeRepository`
 */
export function createChangeRepository(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ChangeRepository

/**
 * Constructs a `ChangeRepository` implementation for the given adapter type.
 *
 * @param type - Adapter type discriminant
 * @param context - Repository context
 * @param config - Adapter options
 * @param extra - Optional extra factory registrations
 * @param extra.changeStorageFactories - Optional map of change storage factories
 * @returns A fully constructed `ChangeRepository`
 */
export function createChangeRepository(
  type: string,
  context: ChangeRepositoryConfig,
  config: Record<string, unknown>,
  extra?: { changeStorageFactories?: Record<string, ChangeStorageFactory> },
): ChangeRepository

/**
 * Main implementation of createChangeRepository.
 *
 * @param args - Overloaded arguments
 * @returns A fully constructed ChangeRepository
 * @throws {@link UnknownAdapterError} When adapter type is not registered
 */
export function createChangeRepository(...args: unknown[]): ChangeRepository {
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
    return resolver.getChangeRepository()
  }

  // Direct / Registry-based lookup
  const [type, context, config, extra] = args as [
    string,
    ChangeRepositoryConfig,
    Record<string, unknown>,
    { changeStorageFactories?: Record<string, ChangeStorageFactory> }?,
  ]
  const builtin = createBuiltinCompositionRegistry()
  const merged = mergeNamedRegistry(
    'changeStorageFactories',
    builtin.changeStorageFactories ?? {},
    extra?.changeStorageFactories,
  )

  const factory = merged.get(type)
  if (!factory) {
    throw new UnknownAdapterError(type, 'change')
  }

  return factory.create(context, config)
}

/**
 * Creates a factory for filesystem-backed change repositories.
 *
 * @returns A `ChangeStorageFactory` instance.
 */
export function createFsChangeStorageFactory(): ChangeStorageFactory {
  return {
    create(context: RepositoryConfig, config: Record<string, unknown>): ChangeRepository {
      return new FsChangeRepository(
        context as unknown as FsChangeRepositoryConfigExtended,
        config as unknown as FsChangeRepositoryConfig,
      )
    },
  }
}

export type { ChangeRepositoryConfig } from '../application/ports/change-repository.js'
export type { FsChangeRepositoryConfig } from '../infrastructure/fs/change-repository.js'
