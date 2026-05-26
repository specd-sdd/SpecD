import { GetDraft } from '../../application/use-cases/get-draft.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { type FsListDraftsOptions, type ListDraftsContext } from './list-drafts.js'

/**
 * Constructs a `GetDraft` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetDraft(config: SpecdConfig): GetDraft
/**
 * Constructs a `GetDraft` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for draft resolution
 * @returns The pre-wired use case instance
 */
export function createGetDraft(context: ListDraftsContext, options: FsListDraftsOptions): GetDraft
/**
 * Implementation overload for {@link createGetDraft}.
 *
 * @param configOrContext - Project config or explicit context
 * @param options - Filesystem paths when using explicit context
 * @returns The pre-wired use case instance
 */
export function createGetDraft(
  configOrContext: SpecdConfig | ListDraftsContext,
  options?: FsListDraftsOptions,
): GetDraft {
  if (isSpecdConfig(configOrContext)) {
    return createGetDraft(
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
  return new GetDraft(changeRepo)
}
