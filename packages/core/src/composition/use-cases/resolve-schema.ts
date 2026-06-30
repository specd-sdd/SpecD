import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { type SchemaRegistry } from '../../application/ports/schema-registry.js'
import { type SchemaOperations } from '../../domain/services/merge-schema-layers.js'
import {
  createResolveSchemaForConfig,
  type SchemaResolutionKernelOptions,
} from '../schema-resolution.js'
import { createSchemaRegistry } from '../schema-registry.js'

/** Filesystem adapter options for `createResolveSchema(options)`. */
export interface FsResolveSchemaOptions {
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  readonly schemaPlugins?: readonly string[]
  readonly schemaOverrides?: SchemaOperations
}

/**
 * Constructs a `ResolveSchema` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param opts - Optional kernel overrides for schema resolution
 * @returns The pre-wired use case instance
 */
export function createResolveSchema(
  config: SpecdConfig,
  opts?: SchemaResolutionKernelOptions,
): ResolveSchema
/**
 * Constructs a `ResolveSchema` use case with explicit adapter options.
 *
 * @param options - Filesystem adapter options for schema resolution
 * @returns The pre-wired use case instance
 */
export function createResolveSchema(options: FsResolveSchemaOptions): ResolveSchema
/**
 * Constructs a `ResolveSchema` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param kernelOpts - Optional kernel options; only used with `SpecdConfig`
 * @returns The pre-wired use case instance
 */
export function createResolveSchema(
  configOrOptions: SpecdConfig | FsResolveSchemaOptions,
  kernelOpts?: SchemaResolutionKernelOptions,
): ResolveSchema {
  if (isSpecdConfig(configOrOptions)) {
    return createResolveSchemaForConfig(configOrOptions, kernelOpts)
  }
  const schemas: SchemaRegistry = createSchemaRegistry('fs', {
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
    schemaRepositories: configOrOptions.schemaRepositories,
  })
  return new ResolveSchema(
    schemas,
    configOrOptions.schemaRef,
    configOrOptions.schemaPlugins ?? [],
    configOrOptions.schemaOverrides,
  )
}
