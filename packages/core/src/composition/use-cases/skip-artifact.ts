import { SkipArtifact } from '../../application/use-cases/skip-artifact.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createVcsActorResolver } from '../actor-resolver.js'

/** Domain context for `createSkipArtifact(context, options)`. */
export interface SkipArtifactContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
}

/** Filesystem adapter paths for `createSkipArtifact(context, options)`. */
export interface FsSkipArtifactOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs a `SkipArtifact` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createSkipArtifact(config: SpecdConfig): SkipArtifact
/**
 * Constructs a `SkipArtifact` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createSkipArtifact(
  context: SkipArtifactContext,
  options: FsSkipArtifactOptions,
): SkipArtifact
/**
 * Constructs a `SkipArtifact` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createSkipArtifact(
  configOrContext: SpecdConfig | SkipArtifactContext,
  options?: FsSkipArtifactOptions,
): SkipArtifact {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createSkipArtifact(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  const actor = createVcsActorResolver()
  return new SkipArtifact(changeRepo, actor)
}
