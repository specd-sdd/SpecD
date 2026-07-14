import { type SpecdConfig } from '../application/specd-config.js'
import {
  type ArchiveRepository,
  type ArchiveRepositoryConfig,
} from '../application/ports/archive-repository.js'
import { type RepositoryConfig } from '../application/ports/repository.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from './composition-resolver.js'
import { createBuiltinCompositionRegistry, mergeNamedRegistry } from './composition-registries.js'
import { type ArchiveStorageFactory } from './archive-storage-factory.js'
import { UnknownAdapterError } from '../domain/errors/index.js'
import {
  FsArchiveRepository,
  type ArchiveRepositoryConfig as FsArchiveRepositoryConfigExtended,
  type FsArchiveRepositoryConfig,
} from '../infrastructure/fs/archive-repository.js'

/**
 * Constructs an `ArchiveRepository` implementation from config.
 *
 * @param config - Resolved project configuration
 * @param options - Additive composition options
 * @returns A fully constructed `ArchiveRepository`
 */
export function createArchiveRepository(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ArchiveRepository

/**
 * Constructs an `ArchiveRepository` implementation for the given adapter type.
 *
 * @param type - Adapter type discriminant
 * @param context - Repository context
 * @param config - Adapter options
 * @param extra - Optional extra factory registrations
 * @param extra.archiveStorageFactories - Optional map of archive storage factories
 * @returns A fully constructed `ArchiveRepository`
 */
export function createArchiveRepository(
  type: string,
  context: ArchiveRepositoryConfig,
  config: Record<string, unknown>,
  extra?: { archiveStorageFactories?: Record<string, ArchiveStorageFactory> },
): ArchiveRepository

/**
 * Main implementation of createArchiveRepository.
 *
 * @param args - Overloaded arguments
 * @returns A fully constructed ArchiveRepository
 * @throws {@link UnknownAdapterError} When adapter type is not registered
 */
export function createArchiveRepository(...args: unknown[]): ArchiveRepository {
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
    return resolver.getArchiveRepository()
  }

  // Direct / Registry-based lookup
  const [type, context, config, extra] = args as [
    string,
    ArchiveRepositoryConfig,
    Record<string, unknown>,
    { archiveStorageFactories?: Record<string, ArchiveStorageFactory> }?,
  ]
  const builtin = createBuiltinCompositionRegistry()
  const merged = mergeNamedRegistry(
    'archiveStorageFactories',
    builtin.archiveStorageFactories ?? {},
    extra?.archiveStorageFactories,
  )

  const factory = merged.get(type)
  if (!factory) {
    throw new UnknownAdapterError(type, 'archive')
  }

  return factory.create(context, config)
}

/**
 * Creates a factory for filesystem-backed archive repositories.
 *
 * @returns An `ArchiveStorageFactory` instance.
 */
export function createFsArchiveStorageFactory(): ArchiveStorageFactory {
  return {
    create(context: RepositoryConfig, config: Record<string, unknown>): ArchiveRepository {
      return new FsArchiveRepository(
        context as unknown as FsArchiveRepositoryConfigExtended,
        config as unknown as FsArchiveRepositoryConfig,
      )
    },
  }
}

export type { ArchiveRepositoryConfig } from '../application/ports/archive-repository.js'
export type { FsArchiveRepositoryConfig } from '../infrastructure/fs/archive-repository.js'
