import * as path from 'node:path'
import { GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSchemaRegistry } from '../schema-registry.js'

/** Filesystem adapter options for `createGetActiveSchema(options)`. */
export interface FsGetActiveSchemaOptions {
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
}

/** Extra options when constructing from a `SpecdConfig`. */
export interface GetActiveSchemaKernelOptions {
  readonly extraNodeModulesPaths?: readonly string[]
}

/**
 * Constructs a `GetActiveSchema` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param opts - Optional kernel options for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetActiveSchema(
  config: SpecdConfig,
  opts?: GetActiveSchemaKernelOptions,
): GetActiveSchema
/**
 * Constructs a `GetActiveSchema` use case with explicit adapter options.
 *
 * @param options - Filesystem adapter options for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetActiveSchema(options: FsGetActiveSchemaOptions): GetActiveSchema
/**
 * Constructs a `GetActiveSchema` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param kernelOpts - Optional kernel options; only used with `SpecdConfig`
 * @returns The pre-wired use case instance
 */
export function createGetActiveSchema(
  configOrOptions: SpecdConfig | FsGetActiveSchemaOptions,
  kernelOpts?: GetActiveSchemaKernelOptions,
): GetActiveSchema {
  if (isSpecdConfig(configOrOptions)) {
    const schemas = createSchemaRegistry('fs', {
      nodeModulesPaths: [
        path.join(configOrOptions.projectRoot, 'node_modules'),
        ...(kernelOpts?.extraNodeModulesPaths ?? []),
      ],
      configDir: configOrOptions.projectRoot,
    })
    return new GetActiveSchema(schemas)
  }
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
  })
  return new GetActiveSchema(schemas)
}
