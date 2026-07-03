import * as path from 'node:path'
import { GetSpecContext } from '../../application/use-cases/get-spec-context.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { createBuiltinExtractorTransforms } from '../extractor-transforms/index.js'
import { createSpecWorkspaceRoutes } from '../spec-workspace-routes.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'

/** Filesystem adapter options for `createGetSpecContext(options)`. */
export interface FsGetSpecContextOptions {
  /** The project orchestrator. */
  readonly listWorkspaces: ListWorkspaces
  /** Absolute path to the `node_modules` directory for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
  /** Project root directory for resolving relative schema paths. */
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  /** Workspace routing metadata for cross-workspace spec reference resolution. */
  readonly workspaceRoutes?: readonly SpecWorkspaceRoute[]
}

/**
 * Constructs a `GetSpecContext` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional kernel options (e.g. extra node_modules paths)
 * @param options.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(
  config: SpecdConfig,
  options?: { extraNodeModulesPaths?: readonly string[] },
): GetSpecContext
/**
 * Constructs a `GetSpecContext` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories and schema resolution paths
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(options: FsGetSpecContextOptions): GetSpecContext
/**
 * Constructs a `GetSpecContext` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param options - Optional kernel options; only used with the `SpecdConfig` form
 * @param options.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(
  configOrOptions: SpecdConfig | FsGetSpecContextOptions,
  options?: { extraNodeModulesPaths?: readonly string[] },
): GetSpecContext {
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
    const schemaRepos = new Map(
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
    return createGetSpecContext({
      listWorkspaces: new ListWorkspaces(config, specRepos),
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(options?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
      schemaRef: config.schemaRef,
      schemaRepositories: schemaRepos,
      workspaceRoutes: createSpecWorkspaceRoutes(config.workspaces),
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
  const parsers = createArtifactParserRegistry()
  const hasher = new NodeContentHasher()
  return new GetSpecContext(
    opts.listWorkspaces,
    hasher,
    schemaProvider,
    parsers,
    createBuiltinExtractorTransforms(),
    opts.workspaceRoutes ?? [],
  )
}
