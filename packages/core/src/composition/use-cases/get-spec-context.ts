import * as path from 'node:path'
import { GetSpecContext } from '../../application/use-cases/get-spec-context.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'

/** Filesystem adapter options for `createGetSpecContext(options)`. */
export interface FsGetSpecContextOptions {
  /**
   * Pre-built spec repositories keyed by workspace name.
   *
   * Must include entries for every workspace declared in the project config.
   */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Constructs a `GetSpecContext` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(config: SpecdConfig): GetSpecContext
/**
 * Constructs a `GetSpecContext` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories keyed by workspace
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(options: FsGetSpecContextOptions): GetSpecContext
/**
 * Constructs a `GetSpecContext` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(
  configOrOptions: SpecdConfig | FsGetSpecContextOptions,
): GetSpecContext {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    return createGetSpecContext({
      specRepositories: new Map(
        config.workspaces.map((ws) => [
          ws.name,
          createSpecRepository(
            'fs',
            {
              workspace: ws.name,
              ownership: ws.ownership,
              isExternal: ws.isExternal,
              configPath: config.configPath,
            },
            {
              specsPath: ws.specsPath,
              metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
              ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
            },
          ),
        ]),
      ),
    })
  }
  const hasher = new NodeContentHasher()
  return new GetSpecContext(configOrOptions.specRepositories, hasher)
}
