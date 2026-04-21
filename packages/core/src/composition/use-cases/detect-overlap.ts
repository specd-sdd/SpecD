import { DetectOverlap } from '../../application/use-cases/detect-overlap.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'

/** Domain context for `createDetectOverlap(context, options)`. */
export interface DetectOverlapContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createDetectOverlap(context, options)`. */
export interface FsDetectOverlapOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs a `DetectOverlap` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createDetectOverlap(config: SpecdConfig): DetectOverlap
/**
 * Constructs a `DetectOverlap` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createDetectOverlap(
  context: DetectOverlapContext,
  options: FsDetectOverlapOptions,
): DetectOverlap
/**
 * Constructs a `DetectOverlap` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createDetectOverlap(
  configOrContext: SpecdConfig | DetectOverlapContext,
  options?: FsDetectOverlapOptions,
): DetectOverlap {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createDetectOverlap(
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
  return new DetectOverlap(changeRepo)
}
