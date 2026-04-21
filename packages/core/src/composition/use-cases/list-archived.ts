import { ListArchived } from '../../application/use-cases/list-archived.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createArchiveRepository } from '../archive-repository.js'

/** Domain context for `createListArchived(context, options)`. */
export interface ListArchivedContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createListArchived(context, options)`. */
export interface FsListArchivedOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly archivePath: string
  readonly archivePattern?: string
}

/**
 * Constructs a `ListArchived` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createListArchived(config: SpecdConfig): ListArchived
/**
 * Constructs a `ListArchived` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for archive resolution
 * @returns The pre-wired use case instance
 */
export function createListArchived(
  context: ListArchivedContext,
  options: FsListArchivedOptions,
): ListArchived
/**
 * Constructs a `ListArchived` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createListArchived(
  configOrContext: SpecdConfig | ListArchivedContext,
  options?: FsListArchivedOptions,
): ListArchived {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createListArchived(
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
          ? { archivePattern: config.storage.archivePattern }
          : {}),
      },
    )
  }
  const archiveRepo = createArchiveRepository('fs', configOrContext, {
    changesPath: options!.changesPath,
    draftsPath: options!.draftsPath,
    archivePath: options!.archivePath,
    ...(options!.archivePattern !== undefined ? { pattern: options!.archivePattern } : {}),
  })
  return new ListArchived(archiveRepo)
}
