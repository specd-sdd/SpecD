import { ApproveSignoff } from '../../application/use-cases/approve-signoff.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { createVcsActorResolver } from '../actor-resolver.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'

/**
 * Domain context for a `ChangeRepository` bound to a single workspace.
 */
export interface ApproveSignoffContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
  readonly configPath: string
}

/**
 * Filesystem adapter paths for `createApproveSignoff(context, options)`.
 */
export interface FsApproveSignoffOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Absolute path to the project root (for schema resolution). */
  readonly projectRoot: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
}

/**
 * Constructs an `ApproveSignoff` use case wired to the default workspace.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createApproveSignoff(config: SpecdConfig): ApproveSignoff
/**
 * Constructs an `ApproveSignoff` use case with explicit context and fs paths.
 *
 * @param context - Workspace domain context
 * @param options - Filesystem adapter paths
 * @returns The pre-wired use case instance
 */
export function createApproveSignoff(
  context: ApproveSignoffContext,
  options: FsApproveSignoffOptions,
): ApproveSignoff
/**
 * Constructs an `ApproveSignoff` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createApproveSignoff(
  configOrContext: SpecdConfig | ApproveSignoffContext,
  options?: FsApproveSignoffOptions,
): ApproveSignoff {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    const schemaRepos = new Map(
      config.workspaces
        .filter((ws2) => ws2.schemasPath !== null)
        .map((ws2) => [
          ws2.name,
          createSchemaRepository(
            'fs',
            {
              workspace: ws2.name,
              ownership: ws2.ownership,
              isExternal: ws2.isExternal,
              configPath: config.configPath,
            },
            { schemasPath: ws2.schemasPath! },
          ),
        ]),
    ) as ReadonlyMap<string, SchemaRepository>
    return createApproveSignoff(
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
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  const actor = createVcsActorResolver()
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: [options!.projectRoot + '/node_modules'],
    configDir: options!.projectRoot,
    schemaRepositories: options!.schemaRepositories,
  })
  const resolveSchema = new ResolveSchema(schemas, options!.schemaRef, [], undefined)
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const hasher = new NodeContentHasher()
  return new ApproveSignoff(changeRepo, actor, schemaProvider, hasher)
}
