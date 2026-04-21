import { ListDiscarded } from '../../application/use-cases/list-discarded.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'

/** Domain context for `createListDiscarded(context, options)`. */
export interface ListDiscardedContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createListDiscarded(context, options)`. */
export interface FsListDiscardedOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs a `ListDiscarded` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createListDiscarded(config: SpecdConfig): ListDiscarded
/**
 * Constructs a `ListDiscarded` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for discarded change resolution
 * @returns The pre-wired use case instance
 */
export function createListDiscarded(
  context: ListDiscardedContext,
  options: FsListDiscardedOptions,
): ListDiscarded
/**
 * Constructs a `ListDiscarded` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createListDiscarded(
  configOrContext: SpecdConfig | ListDiscardedContext,
  options?: FsListDiscardedOptions,
): ListDiscarded {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createListDiscarded(
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
  return new ListDiscarded(changeRepo)
}
