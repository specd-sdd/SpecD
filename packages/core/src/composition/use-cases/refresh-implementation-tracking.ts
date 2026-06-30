import { RefreshImplementationTracking } from '../../application/use-cases/refresh-implementation-tracking.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createArchiveRepository } from '../archive-repository.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'
import { GitVcsAdapter } from '../../infrastructure/git/vcs-adapter.js'
import { VcsImplementationDetector } from '../../infrastructure/vcs/vcs-implementation-detector.js'

/** Domain context for `createRefreshImplementationTracking(context, options)`. */
export interface RefreshImplementationTrackingContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createRefreshImplementationTracking(context, options)`. */
export interface FsRefreshImplementationTrackingOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly archivePath: string
  readonly archivePattern?: string
  readonly projectRoot: string
}

/**
 * Constructs a `RefreshImplementationTracking` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createRefreshImplementationTracking(
  config: SpecdConfig,
): RefreshImplementationTracking
/**
 * Constructs a `RefreshImplementationTracking` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change and archive resolution
 * @returns The pre-wired use case instance
 */
export function createRefreshImplementationTracking(
  context: RefreshImplementationTrackingContext,
  options: FsRefreshImplementationTrackingOptions,
): RefreshImplementationTracking
/**
 * Constructs a `RefreshImplementationTracking` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createRefreshImplementationTracking(
  configOrContext: SpecdConfig | RefreshImplementationTrackingContext,
  options?: FsRefreshImplementationTrackingOptions,
): RefreshImplementationTracking {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createRefreshImplementationTracking(
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
        archivePath: config.storage.archivePath,
        ...(config.storage.archivePattern !== undefined
          ? { archivePattern: config.storage.archivePattern }
          : {}),
        projectRoot: config.projectRoot,
      },
    )
  }
  const opts = options!
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const archiveRepo = createArchiveRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    archivePath: opts.archivePath,
    ...(opts.archivePattern !== undefined ? { pattern: opts.archivePattern } : {}),
  })
  const files = new FsFileReader()
  const implementationDetector = new VcsImplementationDetector(
    opts.projectRoot,
    new GitVcsAdapter(opts.projectRoot),
  )
  return new RefreshImplementationTracking(
    changeRepo,
    archiveRepo,
    implementationDetector,
    files,
    opts.projectRoot,
  )
}
