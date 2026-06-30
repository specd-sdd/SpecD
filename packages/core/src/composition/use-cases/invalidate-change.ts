import { InvalidateChange } from '../../application/use-cases/invalidate-change.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createVcsActorResolver } from '../actor-resolver.js'
import { createSchemaProviderForConfig } from '../schema-resolution.js'

/** Domain context for `createInvalidateChange(context, options)`. */
export interface InvalidateChangeContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createInvalidateChange(context, options)`. */
export interface FsInvalidateChangeOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly schemaProvider: import('../../application/ports/schema-provider.js').SchemaProvider
}

/**
 * Constructs an `InvalidateChange` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createInvalidateChange(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): InvalidateChange
/**
 * Constructs an `InvalidateChange` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and schema provider
 * @returns The pre-wired use case instance
 */
export function createInvalidateChange(
  context: InvalidateChangeContext,
  options: FsInvalidateChangeOptions,
): InvalidateChange
/**
 * Constructs an `InvalidateChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createInvalidateChange(
  configOrContext: SpecdConfig | InvalidateChangeContext,
  options?: FsInvalidateChangeOptions | { extraNodeModulesPaths?: readonly string[] },
): InvalidateChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const ws = getDefaultWorkspace(config)
    const schemaProvider = createSchemaProviderForConfig(config, kernelOpts)
    return createInvalidateChange(
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
        schemaProvider,
      },
    )
  }
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: (options as FsInvalidateChangeOptions).changesPath,
    draftsPath: (options as FsInvalidateChangeOptions).draftsPath,
    discardedPath: (options as FsInvalidateChangeOptions).discardedPath,
  })
  const actor = createVcsActorResolver()
  return new InvalidateChange(
    changeRepo,
    actor,
    (options as FsInvalidateChangeOptions).schemaProvider,
  )
}
