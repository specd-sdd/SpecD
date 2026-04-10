import * as path from 'node:path'
import { GetProjectContext } from '../../application/use-cases/get-project-context.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { createBuiltinExtractorTransforms } from '../extractor-transforms/index.js'

/** Filesystem adapter options for `createGetProjectContext(options)`. */
export interface FsGetProjectContextOptions {
  /**
   * Pre-built spec repositories keyed by workspace name.
   *
   * Must include entries for every workspace declared in the project config.
   */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Absolute path to the `node_modules` directory for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
  /** Project root directory for resolving relative schema paths. */
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
}

/**
 * Constructs a `GetProjectContext` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional kernel options (e.g. extra node_modules paths)
 * @param options.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(
  config: SpecdConfig,
  options?: { extraNodeModulesPaths?: readonly string[] },
): GetProjectContext
/**
 * Constructs a `GetProjectContext` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories, schema resolution paths
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(options: FsGetProjectContextOptions): GetProjectContext
/**
 * Constructs a `GetProjectContext` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param options - Optional kernel options; only used with the `SpecdConfig` form
 * @param options.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(
  configOrOptions: SpecdConfig | FsGetProjectContextOptions,
  options?: { extraNodeModulesPaths?: readonly string[] },
): GetProjectContext {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const schemaRepos = new Map(
      config.workspaces
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
    return createGetProjectContext({
      specRepositories: new Map(
        config.workspaces.map((ws) => [
          ws.name,
          createSpecRepository(
            'fs',
            { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
            {
              specsPath: ws.specsPath,
              metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
              ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
            },
          ),
        ]),
      ),
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(options?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
      schemaRef: config.schemaRef,
      schemaRepositories: schemaRepos,
    })
  }
  const opts = configOrOptions
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.configDir,
    schemaRepositories: opts.schemaRepositories,
  })
  const resolveSchema = new ResolveSchema(schemas, opts.schemaRef, [], undefined)
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const files = new FsFileReader()
  const parsers = createArtifactParserRegistry()
  const hasher = new NodeContentHasher()
  return new GetProjectContext(
    opts.specRepositories,
    schemaProvider,
    files,
    parsers,
    hasher,
    createBuiltinExtractorTransforms(),
  )
}
