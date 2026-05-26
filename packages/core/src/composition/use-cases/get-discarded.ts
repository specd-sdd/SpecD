import { GetDiscarded } from '../../application/use-cases/get-discarded.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { type FsListDraftsOptions, type ListDraftsContext } from './list-drafts.js'

/**
 * Constructs a `GetDiscarded` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetDiscarded(config: SpecdConfig): GetDiscarded
/**
 * Constructs a `GetDiscarded` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for discarded resolution
 * @returns The pre-wired use case instance
 */
export function createGetDiscarded(
  context: ListDraftsContext,
  options: FsListDraftsOptions,
): GetDiscarded
/**
 * Implementation overload for {@link createGetDiscarded}.
 *
 * @param configOrContext - Project config or explicit context
 * @param options - Filesystem paths when using explicit context
 * @returns The pre-wired use case instance
 */
export function createGetDiscarded(
  configOrContext: SpecdConfig | ListDraftsContext,
  options?: FsListDraftsOptions,
): GetDiscarded {
  if (isSpecdConfig(configOrContext)) {
    return createGetDiscarded(
      {
        workspace: getDefaultWorkspace(configOrContext).name,
        ownership: getDefaultWorkspace(configOrContext).ownership,
        isExternal: getDefaultWorkspace(configOrContext).isExternal,
        configPath: configOrContext.configPath,
      },
      {
        changesPath: configOrContext.storage.changesPath,
        draftsPath: configOrContext.storage.draftsPath,
        discardedPath: configOrContext.storage.discardedPath,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  return new GetDiscarded(changeRepo)
}
