import { type SpecdConfig } from '../application/specd-config.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from './composition-resolver.js'
import { createBuiltinCompositionRegistry, mergeNamedRegistry } from './composition-registries.js'
import { type SchemaStorageFactory } from './schema-storage-factory.js'
import { type RepositoryConfig } from '../application/ports/repository.js'
import { UnknownAdapterError } from '../domain/errors/index.js'
import {
  FsSchemaRepository,
  type FsSchemaRepositoryConfig,
} from '../infrastructure/fs/schema-repository.js'

/** Configuration for `SchemaRepository`. */
export type SchemaRepositoryConfig = RepositoryConfig

/**
 * Constructs the default workspace `SchemaRepository` implementation from config.
 *
 * @param config - Resolved project configuration
 * @param options - Additive composition options
 * @returns A fully constructed `SchemaRepository` for the default workspace
 */
export function createSchemaRepository(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SchemaRepository

/**
 * Constructs a `SchemaRepository` implementation for the given adapter type.
 *
 * @param type - Adapter type discriminant
 * @param context - Repository context
 * @param config - Adapter options
 * @param extra - Optional extra factory registrations
 * @param extra.schemaStorageFactories - Optional map of schema storage factories
 * @returns A fully constructed `SchemaRepository`
 */
export function createSchemaRepository(
  type: string,
  context: RepositoryConfig,
  config: Record<string, unknown>,
  extra?: { schemaStorageFactories?: Record<string, SchemaStorageFactory> },
): SchemaRepository

/**
 * Main implementation of createSchemaRepository.
 *
 * @param args - Overloaded arguments
 * @returns A fully constructed SchemaRepository
 * @throws {@link UnknownAdapterError} When adapter type is not registered
 */
export function createSchemaRepository(...args: unknown[]): SchemaRepository {
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
    return resolver.getSchemaRepositories().get('default')!
  }

  // Direct / Registry-based lookup
  const [type, context, config, extra] = args as [
    string,
    RepositoryConfig,
    Record<string, unknown>,
    { schemaStorageFactories?: Record<string, SchemaStorageFactory> }?,
  ]
  const builtin = createBuiltinCompositionRegistry()
  const merged = mergeNamedRegistry(
    'schemaStorageFactories',
    builtin.schemaStorageFactories ?? {},
    extra?.schemaStorageFactories,
  )

  const factory = merged.get(type)
  if (!factory) {
    throw new UnknownAdapterError(type, 'schema')
  }

  return factory.create(context, config)
}
/**
 * Creates a factory for filesystem-backed schema repositories.
 *
 * @returns A `SchemaStorageFactory` instance.
 */
export function createFsSchemaStorageFactory(): SchemaStorageFactory {
  return {
    create(context: RepositoryConfig, config: Record<string, unknown>): SchemaRepository {
      return new FsSchemaRepository(context, config as unknown as FsSchemaRepositoryConfig)
    },
  }
}

export type { FsSchemaRepositoryConfig } from '../infrastructure/fs/schema-repository.js'
