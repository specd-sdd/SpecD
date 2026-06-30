import { ValidateSchema } from '../../application/use-cases/validate-schema.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { type SchemaRegistry } from '../../application/ports/schema-registry.js'
import { buildSchema } from '../../domain/services/build-schema.js'
import {
  createResolveSchemaForConfig,
  createSchemaRegistryForConfig,
} from '../schema-resolution.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { createResolveSchema } from './resolve-schema.js'

/** Filesystem adapter options for `createValidateSchema(options)`. */
export interface FsValidateSchemaOptions {
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
}

/**
 * Constructs a `ValidateSchema` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateSchema(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ValidateSchema
/**
 * Constructs a `ValidateSchema` use case with explicit adapter options.
 *
 * @param options - Filesystem adapter options for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateSchema(options: FsValidateSchemaOptions): ValidateSchema
/**
 * Constructs a `ValidateSchema` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param kernelOpts - Optional kernel options; only used with `SpecdConfig`
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateSchema(
  configOrOptions: SpecdConfig | FsValidateSchemaOptions,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ValidateSchema {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const schemas = createSchemaRegistryForConfig(config, kernelOpts)
    const resolveSchema = createResolveSchemaForConfig(config, kernelOpts)
    return new ValidateSchema(schemas, config.schemaRef, buildSchema, resolveSchema)
  }
  const schemas: SchemaRegistry = createSchemaRegistry('fs', {
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
    schemaRepositories: configOrOptions.schemaRepositories,
  })
  const resolveSchema = createResolveSchema({
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
    schemaRef: configOrOptions.schemaRef,
    schemaRepositories: configOrOptions.schemaRepositories,
  })
  return new ValidateSchema(schemas, configOrOptions.schemaRef, buildSchema, resolveSchema)
}
