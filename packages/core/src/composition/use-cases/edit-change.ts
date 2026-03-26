import { EditChange } from '../../application/use-cases/edit-change.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createVcsActorResolver } from '../actor-resolver.js'

/** Domain context for `createEditChange(context, options)`. */
export interface EditChangeContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
}

/** Filesystem adapter paths for `createEditChange(context, options)`. */
export interface FsEditChangeOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs an `EditChange` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createEditChange(config: SpecdConfig): EditChange
/**
 * Constructs an `EditChange` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and workspace names
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  context: EditChangeContext,
  options: FsEditChangeOptions,
): EditChange
/**
 * Constructs an `EditChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  configOrContext: SpecdConfig | EditChangeContext,
  options?: FsEditChangeOptions,
): EditChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createEditChange(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
      },
    )
  }
  const opts = options!
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const actor = createVcsActorResolver()
  return new EditChange(changeRepo, new Map(), actor)
}
