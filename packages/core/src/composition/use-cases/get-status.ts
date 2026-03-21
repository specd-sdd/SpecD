import * as path from 'node:path'
import { GetStatus } from '../../application/use-cases/get-status.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'

/**
 * Domain context for a `ChangeRepository` bound to a single workspace.
 */
export interface GetStatusContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter paths for `createGetStatus(context, options)`.
 */
export interface FsGetStatusOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Additional `node_modules` directories for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
  /** Project root directory for resolving relative schema paths. */
  readonly configDir: string
  /** Schema reference string from config. */
  readonly schemaRef: string
  /** Map of workspace name → absolute schemas directory path. */
  readonly workspaceSchemasPaths: ReadonlyMap<string, string>
  /** Whether approval gates are active. */
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
}

/**
 * Constructs a `GetStatus` use case wired to the default workspace.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel-level overrides
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetStatus(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): GetStatus
/**
 * Constructs a `GetStatus` use case with explicit context and fs paths.
 *
 * @param context - Workspace domain context
 * @param options - Filesystem adapter paths
 * @returns The pre-wired use case instance
 */
export function createGetStatus(context: GetStatusContext, options: FsGetStatusOptions): GetStatus
/**
 * Constructs a `GetStatus` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createGetStatus(
  configOrContext: SpecdConfig | GetStatusContext,
  options?: FsGetStatusOptions | { extraNodeModulesPaths?: readonly string[] },
): GetStatus {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const ws = getDefaultWorkspace(config)
    const workspaceSchemasPaths = new Map<string, string>()
    for (const w of config.workspaces) {
      if (w.schemasPath !== null) {
        workspaceSchemasPaths.set(w.name, w.schemasPath)
      }
    }
    return createGetStatus(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
        configDir: config.projectRoot,
        schemaRef: config.schemaRef,
        workspaceSchemasPaths,
        approvals: config.approvals,
      },
    )
  }
  const opts = options as FsGetStatusOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.configDir,
  })
  const resolveSchema = new ResolveSchema(
    schemas,
    opts.schemaRef,
    opts.workspaceSchemasPaths,
    [],
    undefined,
  )
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  return new GetStatus(changeRepo, schemaProvider, opts.approvals)
}
