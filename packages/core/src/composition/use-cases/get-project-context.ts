import * as path from 'node:path'
import { GetProjectContext } from '../../application/use-cases/get-project-context.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { createBuiltinExtractorTransforms } from '../extractor-transforms/index.js'
import { createSpecWorkspaceRoutes } from '../spec-workspace-routes.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { buildCompileContextConfig } from '../build-compile-context-config.js'
import { type CompileContextConfig } from '../../application/use-cases/compile-context.js'
import { createSchemaRepositoriesForConfig } from '../schema-resolution.js'
import { createSharedSpecRepositories } from '../shared-repository-wiring.js'

/** Filesystem adapter options for `createGetProjectContext(options)`. */
export interface FsGetProjectContextOptions {
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
  /** Yaml-derived context defaults for {@link GetProjectContext}. */
  readonly defaultConfig: CompileContextConfig
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
    const specRepos = createSharedSpecRepositories({ config })
    const schemaRepos = createSchemaRepositoriesForConfig(config)
    const listWorkspaces = new ListWorkspaces(config, specRepos)
    const defaultConfig = buildCompileContextConfig(config)
    return createGetProjectContext({
      listWorkspaces,
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(options?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
      schemaRef: config.schemaRef,
      schemaRepositories: schemaRepos,
      workspaceRoutes: createSpecWorkspaceRoutes(config.workspaces),
      defaultConfig,
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
    opts.listWorkspaces,
    schemaProvider,
    files,
    parsers,
    hasher,
    createBuiltinExtractorTransforms(),
    opts.workspaceRoutes ?? [],
    opts.defaultConfig,
  )
}
