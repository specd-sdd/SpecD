import * as path from 'node:path'
import { ListSpecs } from '../../application/use-cases/list-specs.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { NodeYamlSerializer } from '../../infrastructure/node/yaml-serializer.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'

/** Filesystem adapter options for `createListSpecs(context, options)`. */
export interface FsListSpecsOptions {
  readonly listWorkspaces: ListWorkspaces
}

/**
 * Constructs a `ListSpecs` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createListSpecs(config: SpecdConfig): ListSpecs
/**
 * Constructs a `ListSpecs` use case with explicit adapter options.
 *
 * @param options - Pre-built spec repositories keyed by workspace
 * @returns The pre-wired use case instance
 */
export function createListSpecs(options: FsListSpecsOptions): ListSpecs
/**
 * Constructs a `ListSpecs` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createListSpecs(configOrOptions: SpecdConfig | FsListSpecsOptions): ListSpecs {
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
    return createListSpecs({
      listWorkspaces: new ListWorkspaces(config, specRepos),
    })
  }
  const hasher = new NodeContentHasher()
  const yaml = new NodeYamlSerializer()
  return new ListSpecs(configOrOptions.listWorkspaces, hasher, yaml)
}
