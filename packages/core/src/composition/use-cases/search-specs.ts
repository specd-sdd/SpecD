import * as path from 'node:path'
import { SearchSpecs } from '../../application/use-cases/search-specs.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { NodeYamlSerializer } from '../../infrastructure/node/yaml-serializer.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'

/**
 * Options for creating SearchSpecs with pre-configured repositories.
 */
export interface FsSearchSpecsOptions {
  readonly listWorkspaces: ListWorkspaces
}

/**
 * Creates a SearchSpecs instance from config or options.
 * @param config - The specd configuration (creates repositories from workspace definitions).
 * @returns A configured SearchSpecs instance.
 */
export function createSearchSpecs(config: SpecdConfig): SearchSpecs
export function createSearchSpecs(options: FsSearchSpecsOptions): SearchSpecs
/**
 * Implementation function for createSearchSpecs overloads.
 * @param configOrOptions - Either a SpecdConfig or FsSearchSpecsOptions.
 * @returns A SearchSpecs instance.
 */
export function createSearchSpecs(
  configOrOptions: SpecdConfig | FsSearchSpecsOptions,
): SearchSpecs {
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
    return createSearchSpecs({
      listWorkspaces: new ListWorkspaces(config, specRepos),
    })
  }
  const hasher = new NodeContentHasher()
  const yaml = new NodeYamlSerializer()
  return new SearchSpecs(configOrOptions.listWorkspaces, hasher, yaml)
}
