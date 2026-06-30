import * as path from 'node:path'
import { GetSpecOutline } from '../../application/use-cases/get-spec-outline.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { createSchemaRepositoriesForConfig } from '../schema-resolution.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createResolveSchema } from './resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'

/** Filesystem adapter options for `createGetSpecOutline(options)`. */
export interface FsGetSpecOutlineOptions {
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
}

/**
 * Constructs a `GetSpecOutline` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetSpecOutline(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): GetSpecOutline
/**
 * Constructs a `GetSpecOutline` use case with explicit adapter options.
 *
 * @param options - Spec repositories and schema resolution paths
 * @returns The pre-wired use case instance
 */
export function createGetSpecOutline(options: FsGetSpecOutlineOptions): GetSpecOutline
/**
 * Constructs a `GetSpecOutline` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param kernelOpts - Optional kernel options; only used with `SpecdConfig`
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetSpecOutline(
  configOrOptions: SpecdConfig | FsGetSpecOutlineOptions,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): GetSpecOutline {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          {
            workspace: ws.name,
            ownership: ws.ownership,
            isExternal: ws.isExternal,
            configPath: config.configPath,
          },
          {
            specsPath: ws.specsPath,
            metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
            ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
          },
        ),
      ]),
    )
    return createGetSpecOutline({
      specRepositories: specRepos,
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(kernelOpts?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
      schemaRef: config.schemaRef,
      schemaRepositories: createSchemaRepositoriesForConfig(config),
    })
  }
  const resolveSchema = createResolveSchema({
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
    schemaRef: configOrOptions.schemaRef,
    schemaRepositories: configOrOptions.schemaRepositories,
  })
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const parsers = createArtifactParserRegistry()
  return new GetSpecOutline(configOrOptions.specRepositories, schemaProvider, parsers)
}
