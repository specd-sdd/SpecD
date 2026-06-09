import { EditChange } from '../../application/use-cases/edit-change.js'
import * as path from 'node:path'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createVcsActorResolver } from '../actor-resolver.js'
import { createSpecRepository } from '../spec-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'

/** Domain context for `createEditChange(context, options)`. */
export interface EditChangeContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createEditChange(context, options)`. */
export interface FsEditChangeOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  /** The project orchestrator. */
  readonly listWorkspaces: ListWorkspaces
}

/**
 * Constructs an `EditChange` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createEditChange(config: SpecdConfig): EditChange
/**
 * Constructs an `EditChange` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and workspace names
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  context: EditChangeContext,
  options: FsEditChangeOptions,
): EditChange
/**
 * Constructs an `EditChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  configOrContext: SpecdConfig | EditChangeContext,
  options?: FsEditChangeOptions,
): EditChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    const changeRepo = createChangeRepository(
      'fs',
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
      },
    )
    const specRepos = new Map(
      config.workspaces.map((workspace) => [
        workspace.name,
        createSpecRepository(
          'fs',
          {
            workspace: workspace.name,
            ownership: workspace.ownership,
            isExternal: workspace.isExternal,
            configPath: config.configPath,
          },
          {
            specsPath: workspace.specsPath,
            metadataPath: path.join(workspace.specsPath, '..', '.specd', 'metadata'),
            ...(workspace.prefix !== undefined ? { prefix: workspace.prefix } : {}),
          },
        ),
      ]),
    )
    const actor = createVcsActorResolver()
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
    ) as ReadonlyMap<
      string,
      import('../../application/ports/schema-repository.js').SchemaRepository
    >
    const schemas = createSchemaRegistry('fs', {
      nodeModulesPaths: [path.join(config.projectRoot, 'node_modules')],
      configDir: config.projectRoot,
      schemaRepositories: schemaRepos,
    })
    const resolveSchema = new ResolveSchema(schemas, config.schemaRef, [], undefined)
    const schemaProvider = new LazySchemaProvider(resolveSchema)
    return new EditChange(changeRepo, new ListWorkspaces(config, specRepos), actor, schemaProvider)
  }
  const opts = options!
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const actor = createVcsActorResolver()
  const schemaProvider: import('../../application/ports/schema-provider.js').SchemaProvider = {
    get: () =>
      Promise.reject(
        new Error('EditChange context factory requires SpecdConfig for schema resolution'),
      ),
  }
  return new EditChange(changeRepo, opts.listWorkspaces, actor, schemaProvider)
}
