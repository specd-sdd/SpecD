import * as path from 'node:path'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createSpecRepository } from '../spec-repository.js'

/** Filesystem adapter options for `createListWorkspaces(options)`. */
export interface FsListWorkspacesOptions {
  /**
   * Pre-built spec repositories keyed by workspace name.
   *
   * Must include entries for every workspace declared in the project config.
   */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Constructs a `ListWorkspaces` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createListWorkspaces(config: SpecdConfig): ListWorkspaces
/**
 * Constructs a `ListWorkspaces` use case with explicit adapter options.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Pre-built spec repositories
 * @returns The pre-wired use case instance
 */
export function createListWorkspaces(
  config: SpecdConfig,
  options: FsListWorkspacesOptions,
): ListWorkspaces
/**
 * Constructs a `ListWorkspaces` instance wired with filesystem adapters.
 *
 * @param config - A fully-resolved `SpecdConfig`
 * @param options - Optional explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createListWorkspaces(
  config: SpecdConfig,
  options?: FsListWorkspacesOptions,
): ListWorkspaces {
  if (options === undefined) {
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
    return new ListWorkspaces(config, specRepos)
  }
  return new ListWorkspaces(config, options.specRepositories)
}
