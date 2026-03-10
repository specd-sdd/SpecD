import * as path from 'node:path'
import { GetProjectContext } from '../../application/use-cases/get-project-context.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'

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
  readonly workspaceSchemasPaths: ReadonlyMap<string, string>
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
    const workspaceSchemasPaths = new Map<string, string>()
    for (const ws of config.workspaces) {
      if (ws.schemasPath !== null) {
        workspaceSchemasPaths.set(ws.name, ws.schemasPath)
      }
    }
    return createGetProjectContext({
      specRepositories: new Map(
        config.workspaces.map((ws) => [
          ws.name,
          createSpecRepository(
            'fs',
            { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
            { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
          ),
        ]),
      ),
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(options?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
      schemaRef: config.schemaRef,
      workspaceSchemasPaths,
    })
  }
  const opts = configOrOptions
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.configDir,
  })
  const files = new FsFileReader()
  const parsers = createArtifactParserRegistry()
  const hasher = new NodeContentHasher()
  return new GetProjectContext(
    opts.specRepositories,
    schemas,
    files,
    parsers,
    hasher,
    opts.schemaRef,
    opts.workspaceSchemasPaths,
  )
}
