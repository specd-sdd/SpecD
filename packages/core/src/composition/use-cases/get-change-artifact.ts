import { GetChangeArtifact } from '../../application/use-cases/get-change-artifact.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { type FsListDraftsOptions, type ListDraftsContext } from './list-drafts.js'

/**
 * Constructs a `GetChangeArtifact` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetChangeArtifact(config: SpecdConfig): GetChangeArtifact
/**
 * Constructs a `GetChangeArtifact` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createGetChangeArtifact(
  context: ListDraftsContext,
  options: FsListDraftsOptions,
): GetChangeArtifact
/**
 * Implementation overload for {@link createGetChangeArtifact}.
 *
 * @param configOrContext - Project config or explicit context
 * @param options - Filesystem paths when using explicit context
 * @returns The pre-wired use case instance
 */
export function createGetChangeArtifact(
  configOrContext: SpecdConfig | ListDraftsContext,
  options?: FsListDraftsOptions,
): GetChangeArtifact {
  if (isSpecdConfig(configOrContext)) {
    return createGetChangeArtifact(
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
  return new GetChangeArtifact(changeRepo)
}
