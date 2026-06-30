import { OutlineChangeArtifact } from '../../application/use-cases/outline-change-artifact.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { type FsListDraftsOptions, type ListDraftsContext } from './list-drafts.js'

/**
 * Constructs an `OutlineChangeArtifact` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createOutlineChangeArtifact(config: SpecdConfig): OutlineChangeArtifact
/**
 * Constructs an `OutlineChangeArtifact` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createOutlineChangeArtifact(
  context: ListDraftsContext,
  options: FsListDraftsOptions,
): OutlineChangeArtifact
/**
 * Implementation overload for {@link createOutlineChangeArtifact}.
 *
 * @param configOrContext - Project config or explicit context
 * @param options - Filesystem paths when using explicit context
 * @returns The pre-wired use case instance
 */
export function createOutlineChangeArtifact(
  configOrContext: SpecdConfig | ListDraftsContext,
  options?: FsListDraftsOptions,
): OutlineChangeArtifact {
  if (isSpecdConfig(configOrContext)) {
    return createOutlineChangeArtifact(
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
  return new OutlineChangeArtifact(changeRepo, createArtifactParserRegistry())
}
