import { GetReadOnlyChangeArtifact } from '../../application/use-cases/get-read-only-change-artifact.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createArchiveRepository } from '../archive-repository.js'
import { createSharedChangeRepository } from '../shared-repository-wiring.js'
import {
  type FsGetArchivedChangeOptions,
  type GetArchivedChangeContext,
} from './get-archived-change.js'

/** Filesystem paths for read-only artifact loading. */
export interface FsGetReadOnlyChangeArtifactOptions extends FsGetArchivedChangeOptions {
  readonly discardedPath: string
}

/**
 * Constructs a `GetReadOnlyChangeArtifact` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetReadOnlyChangeArtifact(config: SpecdConfig): GetReadOnlyChangeArtifact
/**
 * Constructs a `GetReadOnlyChangeArtifact` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change and archive resolution
 * @returns The pre-wired use case instance
 */
export function createGetReadOnlyChangeArtifact(
  context: GetArchivedChangeContext,
  options: FsGetReadOnlyChangeArtifactOptions,
): GetReadOnlyChangeArtifact
/**
 * Implementation overload for {@link createGetReadOnlyChangeArtifact}.
 *
 * @param configOrContext - Project config or explicit context
 * @param options - Filesystem paths when using explicit context
 * @returns The pre-wired use case instance
 */
export function createGetReadOnlyChangeArtifact(
  configOrContext: SpecdConfig | GetArchivedChangeContext,
  options?: FsGetReadOnlyChangeArtifactOptions,
): GetReadOnlyChangeArtifact {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return new GetReadOnlyChangeArtifact(
      createSharedChangeRepository({ config }),
      createArchiveRepository(
        'fs',
        {
          workspace: ws.name,
          ownership: ws.ownership,
          isExternal: ws.isExternal,
          configPath: config.configPath,
        },
        {
          changesPath: config.storage.changesPath,
          draftsPath: config.storage.draftsPath,
          archivePath: config.storage.archivePath,
          ...(config.storage.archivePattern !== undefined
            ? { pattern: config.storage.archivePattern }
            : {}),
        },
      ),
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: options!.changesPath,
    draftsPath: options!.draftsPath,
    discardedPath: options!.discardedPath,
  })
  const archiveRepo = createArchiveRepository('fs', configOrContext, {
    changesPath: options!.changesPath,
    draftsPath: options!.draftsPath,
    archivePath: options!.archivePath,
    ...(options!.archivePattern !== undefined ? { pattern: options!.archivePattern } : {}),
  })
  return new GetReadOnlyChangeArtifact(changeRepo, archiveRepo)
}
