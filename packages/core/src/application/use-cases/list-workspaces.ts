import { type SpecdConfig } from '../specd-config.js'
import { type SpecRepository } from '../ports/spec-repository.js'

/**
 * An orchestrated, rich view of a project workspace.
 *
 * Bundles workspace identity, filesystem paths, ownership semantics, and
 * the initialized storage adapter (repository) into a single entity for
 * project traversal.
 */
export interface ProjectWorkspace {
  /** The workspace name (e.g. `'default'`, `'core'`). */
  readonly name: string
  /** Absolute path to the implementation code root for this workspace. */
  readonly codeRoot: string
  /** `true` when the workspace specs are outside the project VCS root. */
  readonly isExternal: boolean
  /** Ownership relationship this project has with this workspace's specs. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Initialized repository port for reading and writing specs. */
  readonly specRepo: SpecRepository
}

/**
 * Use case that orchestrates the project configuration with available repositories.
 *
 * It provides a unified, rich list of all configured workspaces, serving as the
 * single source of truth for discovery UIs, status reporting, and graph indexing.
 */
export class ListWorkspaces {
  /**
   * Creates a new `ListWorkspaces` instance.
   *
   * @param _config - The active project configuration
   * @param _specRepos - Map of workspace names to initialized spec repositories
   */
  constructor(
    private readonly _config: SpecdConfig,
    private readonly _specRepos: ReadonlyMap<string, SpecRepository>,
  ) {}

  /**
   * Returns a map of all initialized spec repositories keyed by workspace name.
   */
  get repos(): ReadonlyMap<string, SpecRepository> {
    return this._specRepos
  }

  /**
   * Returns the orchestrated list of all configured workspaces.
   *
   * Results preserve the declaration order from `specd.yaml`.
   *
   * @returns The list of project workspaces
   */
  async execute(): Promise<ProjectWorkspace[]> {
    await Promise.resolve()
    return this._config.workspaces.map((workspace) => {
      const specRepo = this._specRepos.get(workspace.name)
      if (specRepo === undefined) {
        throw new Error(
          `Spec repository not found for workspace "${workspace.name}". ` +
            'This indicates a composition-level wiring error.',
        )
      }

      return {
        name: workspace.name,
        codeRoot: workspace.codeRoot,
        isExternal: workspace.isExternal,
        ownership: workspace.ownership,
        specRepo,
      }
    })
  }
}
