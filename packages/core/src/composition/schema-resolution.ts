import * as path from 'node:path'
import { type SpecdConfig } from '../application/specd-config.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { ResolveSchema } from '../application/use-cases/resolve-schema.js'
import { createSchemaRepository } from './schema-repository.js'
import { createSchemaRegistry } from './schema-registry.js'
import { LazySchemaProvider } from './lazy-schema-provider.js'

/** Optional kernel overrides for schema resolution from config. */
export interface SchemaResolutionKernelOptions {
  readonly extraNodeModulesPaths?: readonly string[]
}

/**
 * Builds workspace schema repositories from project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns Map of workspace name to schema repository
 */
export function createSchemaRepositoriesForConfig(
  config: SpecdConfig,
): ReadonlyMap<string, SchemaRepository> {
  return new Map(
    config.workspaces
      .filter((ws) => ws.schemasPath !== null)
      .map((ws) => [
        ws.name,
        createSchemaRepository(
          'fs',
          {
            workspace: ws.name,
            ownership: ws.ownership,
            isExternal: ws.isExternal,
            configPath: config.configPath,
          },
          { schemasPath: ws.schemasPath! },
        ),
      ]),
  ) as ReadonlyMap<string, SchemaRepository>
}

/**
 * Constructs a schema registry wired from project config.
 *
 * @param config - The fully-resolved project configuration
 * @param opts - Optional kernel overrides for node_modules resolution
 * @returns A fully-wired schema registry
 */
export function createSchemaRegistryForConfig(
  config: SpecdConfig,
  opts?: SchemaResolutionKernelOptions,
): SchemaRegistry {
  return createSchemaRegistry('fs', {
    nodeModulesPaths: [
      path.join(config.projectRoot, 'node_modules'),
      ...(opts?.extraNodeModulesPaths ?? []),
    ],
    configDir: config.projectRoot,
    schemaRepositories: createSchemaRepositoriesForConfig(config),
  })
}

/**
 * Constructs a `ResolveSchema` use case from project config.
 *
 * @param config - The fully-resolved project configuration
 * @param opts - Optional kernel overrides for node_modules resolution
 * @returns The pre-wired resolve-schema use case
 */
export function createResolveSchemaForConfig(
  config: SpecdConfig,
  opts?: SchemaResolutionKernelOptions,
): ResolveSchema {
  const schemas = createSchemaRegistryForConfig(config, opts)
  return new ResolveSchema(
    schemas,
    config.schemaRef,
    config.schemaPlugins ?? [],
    config.schemaOverrides,
  )
}

/**
 * Constructs a lazy schema provider from project config.
 *
 * @param config - The fully-resolved project configuration
 * @param opts - Optional kernel overrides for node_modules resolution
 * @returns A caching schema provider backed by resolve-schema
 */
export function createSchemaProviderForConfig(
  config: SpecdConfig,
  opts?: SchemaResolutionKernelOptions,
): LazySchemaProvider {
  return new LazySchemaProvider(createResolveSchemaForConfig(config, opts))
}
