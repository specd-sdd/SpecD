import { ListChanges } from '../../application/use-cases/list-changes.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createChangeRepository } from '../change-repository.js'
import { createSharedChangeRepository } from '../shared-repository-wiring.js'

/** Domain context for `createListChanges(context, options)`. */
export interface ListChangesContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createListChanges(context, options)`. */
export interface FsListChangesOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs a `ListChanges` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createListChanges(config: SpecdConfig): ListChanges
/**
 * Constructs a `ListChanges` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createListChanges(
  context: ListChangesContext,
  options: FsListChangesOptions,
): ListChanges
/**
 * Constructs a `ListChanges` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createListChanges(
  configOrContext: SpecdConfig | ListChangesContext,
  options?: FsListChangesOptions,
): ListChanges {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const changeRepo = createSharedChangeRepository({ config })
    return new ListChanges(changeRepo)
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  return new ListChanges(changeRepo)
}
