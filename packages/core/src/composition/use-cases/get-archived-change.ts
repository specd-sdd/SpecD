import { GetArchivedChange } from '../../application/use-cases/get-archived-change.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createArchiveRepository } from '../archive-repository.js'

/** Domain context for `createGetArchivedChange(context, options)`. */
export interface GetArchivedChangeContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
}

/** Filesystem adapter paths for `createGetArchivedChange(context, options)`. */
export interface FsGetArchivedChangeOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly archivePath: string
  readonly archivePattern?: string
}

/**
 * Constructs a `GetArchivedChange` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetArchivedChange(config: SpecdConfig): GetArchivedChange
/**
 * Constructs a `GetArchivedChange` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for archive resolution
 * @returns The pre-wired use case instance
 */
export function createGetArchivedChange(
  context: GetArchivedChangeContext,
  options: FsGetArchivedChangeOptions,
): GetArchivedChange
/**
 * Constructs a `GetArchivedChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createGetArchivedChange(
  configOrContext: SpecdConfig | GetArchivedChangeContext,
  options?: FsGetArchivedChangeOptions,
): GetArchivedChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = config.workspaces.find((w) => w.name === 'default')!
    return createGetArchivedChange(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
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
  return new GetArchivedChange(archiveRepo)
}
