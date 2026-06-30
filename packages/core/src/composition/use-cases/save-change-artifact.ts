import * as path from 'node:path'
import { SaveChangeArtifact } from '../../application/use-cases/save-change-artifact.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSchemaRepositoriesForConfig } from '../schema-resolution.js'
import { createResolveSchema } from './resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { type FsListDraftsOptions, type ListDraftsContext } from './list-drafts.js'

/** Domain context for `createSaveChangeArtifact(context, options)`. */
export type SaveChangeArtifactContext = ListDraftsContext

/** Filesystem adapter paths for `createSaveChangeArtifact(context, options)`. */
export interface FsSaveChangeArtifactOptions extends FsListDraftsOptions {
  readonly projectRoot: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  readonly nodeModulesPaths: readonly string[]
}

/**
 * Constructs a `SaveChangeArtifact` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createSaveChangeArtifact(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): SaveChangeArtifact
/**
 * Constructs a `SaveChangeArtifact` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and schema wiring
 * @returns The pre-wired use case instance
 */
export function createSaveChangeArtifact(
  context: SaveChangeArtifactContext,
  options: FsSaveChangeArtifactOptions,
): SaveChangeArtifact
/**
 * Implementation overload for {@link createSaveChangeArtifact}.
 *
 * @param configOrContext - Project config or explicit context
 * @param options - Filesystem path options when using explicit context
 * @returns The pre-wired use case instance
 */
export function createSaveChangeArtifact(
  configOrContext: SpecdConfig | SaveChangeArtifactContext,
  options?: FsSaveChangeArtifactOptions | { extraNodeModulesPaths?: readonly string[] },
): SaveChangeArtifact {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const ws = getDefaultWorkspace(config)
    const schemaRepos = createSchemaRepositoriesForConfig(config)
    return createSaveChangeArtifact(
      {
        workspace: ws.name,
        ownership: ws.ownership,
        isExternal: ws.isExternal,
        configPath: config.configPath,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        projectRoot: config.projectRoot,
        schemaRef: config.schemaRef,
        schemaRepositories: schemaRepos,
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
      },
    )
  }
  const opts = options as FsSaveChangeArtifactOptions
  const changeRepo = createChangeRepository('fs', configOrContext, opts)
  const resolveSchema = createResolveSchema({
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.projectRoot,
    schemaRef: opts.schemaRef,
    schemaRepositories: opts.schemaRepositories,
  })
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  return new SaveChangeArtifact(changeRepo, schemaProvider, new NodeContentHasher())
}
