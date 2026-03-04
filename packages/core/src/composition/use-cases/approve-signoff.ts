import { ApproveSignoff } from '../../application/use-cases/approve-signoff.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { GitCLIAdapter } from '../../infrastructure/git/git-adapter.js'

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
    return createApproveSignoff(
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
  return new ApproveSignoff(changeRepo, git)
}
