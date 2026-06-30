import { UpdateSpecDeps } from '../../application/use-cases/update-spec-deps.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'

/** Domain context for `createUpdateSpecDeps(context, options)`. */
export interface UpdateSpecDepsContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createUpdateSpecDeps(context, options)`. */
export interface FsUpdateSpecDepsOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
}

/**
 * Constructs an `UpdateSpecDeps` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecDeps(config: SpecdConfig): UpdateSpecDeps
/**
 * Constructs an `UpdateSpecDeps` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths for change resolution
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecDeps(
  context: UpdateSpecDepsContext,
  options: FsUpdateSpecDepsOptions,
): UpdateSpecDeps
/**
 * Constructs an `UpdateSpecDeps` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecDeps(
  configOrContext: SpecdConfig | UpdateSpecDepsContext,
  options?: FsUpdateSpecDepsOptions,
): UpdateSpecDeps {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    return createUpdateSpecDeps(
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
  return new UpdateSpecDeps(changeRepo)
}
