import * as path from 'node:path'
import { RunStepHooks } from '../../application/use-cases/run-step-hooks.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createArchiveRepository } from '../archive-repository.js'
import { createSchemaRepositoriesForConfig } from '../schema-resolution.js'
import { NodeHookRunner } from '../../infrastructure/node/hook-runner.js'
import { TemplateExpander } from '../../application/template-expander.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createResolveSchema } from './resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'

/** Domain context for `createRunStepHooks(context, options)`. */
export interface RunStepHooksContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createRunStepHooks(context, options)`. */
export interface FsRunStepHooksOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly archivePath: string
  readonly archivePattern?: string
  readonly projectRoot: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  readonly nodeModulesPaths: readonly string[]
}

/**
 * Constructs a `RunStepHooks` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createRunStepHooks(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): RunStepHooks
/**
 * Constructs a `RunStepHooks` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and schema wiring
 * @returns The pre-wired use case instance
 */
export function createRunStepHooks(
  context: RunStepHooksContext,
  options: FsRunStepHooksOptions,
): RunStepHooks
/**
 * Constructs a `RunStepHooks` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createRunStepHooks(
  configOrContext: SpecdConfig | RunStepHooksContext,
  options?: FsRunStepHooksOptions | { extraNodeModulesPaths?: readonly string[] },
): RunStepHooks {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const ws = getDefaultWorkspace(config)
    return createRunStepHooks(
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
        archivePath: config.storage.archivePath,
        ...(config.storage.archivePattern !== undefined
          ? { archivePattern: config.storage.archivePattern }
          : {}),
        projectRoot: config.projectRoot,
        schemaRef: config.schemaRef,
        schemaRepositories: createSchemaRepositoriesForConfig(config),
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
      },
    )
  }
  const opts = options as FsRunStepHooksOptions
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
  const resolveSchema = createResolveSchema({
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.projectRoot,
    schemaRef: opts.schemaRef,
    schemaRepositories: opts.schemaRepositories,
  })
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const expander = new TemplateExpander({ project: { root: opts.projectRoot } })
  const hooks = new NodeHookRunner(expander)
  return new RunStepHooks(changeRepo, archiveRepo, hooks, new Map(), schemaProvider)
}
