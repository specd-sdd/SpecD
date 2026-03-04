import { SaveSpecMetadata } from '../../application/use-cases/save-spec-metadata.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createSpecRepository } from '../spec-repository.js'

/** Filesystem adapter options for `createSaveSpecMetadata(options)`. */
export interface FsSaveSpecMetadataOptions {
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Constructs a `SaveSpecMetadata` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createSaveSpecMetadata(config: SpecdConfig): SaveSpecMetadata
/**
 * Constructs a `SaveSpecMetadata` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories keyed by workspace
 * @returns The pre-wired use case instance
 */
export function createSaveSpecMetadata(options: FsSaveSpecMetadataOptions): SaveSpecMetadata
/**
 * Constructs a `SaveSpecMetadata` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createSaveSpecMetadata(
  configOrOptions: SpecdConfig | FsSaveSpecMetadataOptions,
): SaveSpecMetadata {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
          { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
        ),
      ]),
    )
    return new SaveSpecMetadata(specRepos)
  }
  return new SaveSpecMetadata(configOrOptions.specRepositories)
}
