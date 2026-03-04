import { GetStatus } from '../../application/use-cases/get-status.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'

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
}

/**
 * Constructs a `GetStatus` use case wired to the default workspace.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetStatus(config: SpecdConfig): GetStatus
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
  options?: FsGetStatusOptions,
): GetStatus {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createGetStatus(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  return new GetStatus(changeRepo)
}
