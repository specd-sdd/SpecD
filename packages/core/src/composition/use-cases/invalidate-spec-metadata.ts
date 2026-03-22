import * as path from 'node:path'
import { InvalidateSpecMetadata } from '../../application/use-cases/invalidate-spec-metadata.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { NodeYamlSerializer } from '../../infrastructure/node/yaml-serializer.js'

/** Filesystem adapter options for `createInvalidateSpecMetadata(options)`. */
export interface FsInvalidateSpecMetadataOptions {
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Constructs an `InvalidateSpecMetadata` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createInvalidateSpecMetadata(config: SpecdConfig): InvalidateSpecMetadata
/**
 * Constructs an `InvalidateSpecMetadata` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories keyed by workspace
 * @returns The pre-wired use case instance
 */
export function createInvalidateSpecMetadata(
  options: FsInvalidateSpecMetadataOptions,
): InvalidateSpecMetadata
/**
 * Constructs an `InvalidateSpecMetadata` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createInvalidateSpecMetadata(
  configOrOptions: SpecdConfig | FsInvalidateSpecMetadataOptions,
): InvalidateSpecMetadata {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
          {
            specsPath: ws.specsPath,
            metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
            ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
          },
        ),
      ]),
    )
    return new InvalidateSpecMetadata(specRepos, new NodeYamlSerializer())
  }
  return new InvalidateSpecMetadata(configOrOptions.specRepositories, new NodeYamlSerializer())
}
