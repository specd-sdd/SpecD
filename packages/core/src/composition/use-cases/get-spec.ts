import * as path from 'node:path'
import { GetSpec } from '../../application/use-cases/get-spec.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createSpecRepository } from '../spec-repository.js'

/** Filesystem adapter options for `createGetSpec(options)`. */
export interface FsGetSpecOptions {
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Constructs a `GetSpec` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetSpec(config: SpecdConfig): GetSpec
/**
 * Constructs a `GetSpec` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories keyed by workspace
 * @returns The pre-wired use case instance
 */
export function createGetSpec(options: FsGetSpecOptions): GetSpec
/**
 * Constructs a `GetSpec` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createGetSpec(configOrOptions: SpecdConfig | FsGetSpecOptions): GetSpec {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const specRepos = new Map(
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
    )
    return new GetSpec(specRepos)
  }
  return new GetSpec(configOrOptions.specRepositories)
}
