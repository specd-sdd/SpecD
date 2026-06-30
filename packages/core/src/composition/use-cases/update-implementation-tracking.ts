import { UpdateImplementationTracking } from '../../application/use-cases/update-implementation-tracking.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'

/** Domain context for `createUpdateImplementationTracking(context, options)`. */
export interface UpdateImplementationTrackingContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createUpdateImplementationTracking(context, options)`. */
export interface FsUpdateImplementationTrackingOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly projectRoot: string
}

/**
 * Constructs an `UpdateImplementationTracking` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createUpdateImplementationTracking(
  config: SpecdConfig,
): UpdateImplementationTracking
/**
 * Constructs an `UpdateImplementationTracking` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createUpdateImplementationTracking(
  context: UpdateImplementationTrackingContext,
  options: FsUpdateImplementationTrackingOptions,
): UpdateImplementationTracking
/**
 * Constructs an `UpdateImplementationTracking` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createUpdateImplementationTracking(
  configOrContext: SpecdConfig | UpdateImplementationTrackingContext,
  options?: FsUpdateImplementationTrackingOptions,
): UpdateImplementationTracking {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createUpdateImplementationTracking(
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
        projectRoot: config.projectRoot,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: options!.changesPath,
    draftsPath: options!.draftsPath,
    discardedPath: options!.discardedPath,
  })
  const files = new FsFileReader()
  return new UpdateImplementationTracking(changeRepo, files, options!.projectRoot)
}
