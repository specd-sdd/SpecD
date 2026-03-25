import * as path from 'node:path'
import { TransitionChange } from '../../application/use-cases/transition-change.js'
import { RunStepHooks } from '../../application/use-cases/run-step-hooks.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { createVcsActorResolver } from '../actor-resolver.js'
import { createArchiveRepository } from '../archive-repository.js'
import { NodeHookRunner } from '../../infrastructure/node/hook-runner.js'
import { TemplateExpander } from '../../application/template-expander.js'

/**
 * Domain context for a `ChangeRepository` bound to a single workspace.
 */
export interface TransitionChangeContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter paths for `createTransitionChange(context, options)`.
 */
export interface FsTransitionChangeOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /** Optional archive directory pattern (e.g. `'{{year}}/{{change.archivedName}}'`). */
  readonly archivePattern?: string
  /** Additional `node_modules` directories for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
  /** Project root directory for resolving relative schema paths. */
  readonly configDir: string
  /** Schema reference string from config. */
  readonly schemaRef: string
  /** Map of workspace name → schema repository instance. */
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  /** Absolute path to the project root. */
  readonly projectRoot: string
}

/**
 * Constructs a `TransitionChange` use case wired to the default workspace.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel-level overrides
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createTransitionChange(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): TransitionChange
/**
 * Constructs a `TransitionChange` use case with explicit context and fs paths.
 *
 * @param context - Workspace domain context
 * @param options - Filesystem adapter paths
 * @returns The pre-wired use case instance
 */
export function createTransitionChange(
  context: TransitionChangeContext,
  options: FsTransitionChangeOptions,
): TransitionChange
/**
 * Constructs a `TransitionChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createTransitionChange(
  configOrContext: SpecdConfig | TransitionChangeContext,
  options?: FsTransitionChangeOptions | { extraNodeModulesPaths?: readonly string[] },
): TransitionChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const ws = getDefaultWorkspace(config)
    const schemaRepos = new Map(
      config.workspaces
        .filter((w) => w.schemasPath !== null)
        .map((w) => [
          w.name,
          createSchemaRepository(
            'fs',
            { workspace: w.name, ownership: w.ownership, isExternal: w.isExternal },
            { schemasPath: w.schemasPath! },
          ),
        ]),
    ) as ReadonlyMap<string, SchemaRepository>
    return createTransitionChange(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        archivePath: config.storage.archivePath,
        ...(config.storage.archivePattern !== undefined
          ? { archivePattern: config.storage.archivePattern }
          : {}),
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
        configDir: config.projectRoot,
        schemaRef: config.schemaRef,
        schemaRepositories: schemaRepos,
        projectRoot: config.projectRoot,
      },
    )
  }
  const opts = options as FsTransitionChangeOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const archiveRepo = createArchiveRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    archivePath: opts.archivePath,
    ...(opts.archivePattern !== undefined ? { pattern: opts.archivePattern } : {}),
  })
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.configDir,
    schemaRepositories: opts.schemaRepositories,
  })
  const resolveSchema = new ResolveSchema(schemas, opts.schemaRef, [], undefined)
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const expander = new TemplateExpander({ project: { root: opts.projectRoot } })
  const hooks = new NodeHookRunner(expander)
  const actor = createVcsActorResolver()
  const runStepHooks = new RunStepHooks(changeRepo, archiveRepo, hooks, schemaProvider)
  return new TransitionChange(changeRepo, actor, schemaProvider, runStepHooks)
}
