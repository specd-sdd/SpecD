import { RestoreChange } from '../../application/use-cases/restore-change.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createChangeRepository } from '../change-repository.js'
import { GitCLIAdapter } from '../../infrastructure/git/git-adapter.js'

/**
 * Domain context for a `ChangeRepository` bound to a single workspace.
 */
export interface RestoreChangeContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter paths for `createRestoreChange(context, options)`.
 */
export interface FsRestoreChangeOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
}

/**
 * Constructs a `RestoreChange` use case wired to the default workspace.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createRestoreChange(config: SpecdConfig): RestoreChange
/**
 * Constructs a `RestoreChange` use case with explicit context and fs paths.
 *
 * @param context - Workspace domain context
 * @param options - Filesystem adapter paths
 * @returns The pre-wired use case instance
 */
export function createRestoreChange(
  context: RestoreChangeContext,
  options: FsRestoreChangeOptions,
): RestoreChange
/**
 * Constructs a `RestoreChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createRestoreChange(
  configOrContext: SpecdConfig | RestoreChangeContext,
  options?: FsRestoreChangeOptions,
): RestoreChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = config.workspaces.find((w) => w.name === 'default')!
    return createRestoreChange(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  const git = new GitCLIAdapter()
  return new RestoreChange(changeRepo, git)
}
