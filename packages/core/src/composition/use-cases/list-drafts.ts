import { ListDrafts } from '../../application/use-cases/list-drafts.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'

/** Domain context for `createListDrafts(context, options)`. */
export interface ListDraftsContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createListDrafts(context, options)`. */
export interface FsListDraftsOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs a `ListDrafts` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createListDrafts(config: SpecdConfig): ListDrafts
/**
 * Constructs a `ListDrafts` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for draft resolution
 * @returns The pre-wired use case instance
 */
export function createListDrafts(
  context: ListDraftsContext,
  options: FsListDraftsOptions,
): ListDrafts
/**
 * Constructs a `ListDrafts` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createListDrafts(
  configOrContext: SpecdConfig | ListDraftsContext,
  options?: FsListDraftsOptions,
): ListDrafts {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createListDrafts(
      {
        workspace: ws.name,
        ownership: ws.ownership,
        isExternal: ws.isExternal,
        configPath: config.configPath,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  return new ListDrafts(changeRepo)
}
