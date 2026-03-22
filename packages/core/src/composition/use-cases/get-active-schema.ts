import * as path from 'node:path'
import { GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SchemaOperations } from '../../domain/services/merge-schema-layers.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { createSchemaRegistry } from '../schema-registry.js'

/** Filesystem adapter options for `createGetActiveSchema(options)`. */
export interface FsGetActiveSchemaOptions {
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  readonly schemaPlugins?: readonly string[]
  readonly schemaOverrides?: SchemaOperations
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
    const schemaRepos = new Map(
      configOrOptions.workspaces
        .filter((ws) => ws.schemasPath !== null)
        .map((ws) => [
          ws.name,
          createSchemaRepository(
            'fs',
            { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
            { schemasPath: ws.schemasPath! },
          ),
        ]),
    ) as ReadonlyMap<string, SchemaRepository>
    const schemas = createSchemaRegistry('fs', {
      nodeModulesPaths: [
        path.join(configOrOptions.projectRoot, 'node_modules'),
        ...(kernelOpts?.extraNodeModulesPaths ?? []),
      ],
      configDir: configOrOptions.projectRoot,
      schemaRepositories: schemaRepos,
    })
    const schemaRef = configOrOptions.schemaRef
    const resolveSchema = new ResolveSchema(
      schemas,
      schemaRef,
      configOrOptions.schemaPlugins ?? [],
      configOrOptions.schemaOverrides,
    )
    return new GetActiveSchema(resolveSchema)
  }
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
    schemaRepositories: configOrOptions.schemaRepositories,
  })
  const resolveSchema = new ResolveSchema(
    schemas,
    configOrOptions.schemaRef,
    configOrOptions.schemaPlugins ?? [],
    configOrOptions.schemaOverrides,
  )
  return new GetActiveSchema(resolveSchema)
}
