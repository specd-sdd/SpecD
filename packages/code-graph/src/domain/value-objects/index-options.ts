import { type ProjectWorkspace, type SpecMetadata } from '@specd/core'

/**
 * Progress callback invoked during indexing to report completion percentage and phase.
 * @param percent - Completion percentage (0-100).
 * @param phase - Current phase description.
 */
export type IndexProgressCallback = (percent: number, phase: string) => void

/**
 * Project-level graph configuration derived from specd.yaml.
 */
export interface ProjectGraphConfig {
  /**
   * Optional project-global graph include paths relative to project root.
   *
   * If provided, the indexer will discover non-workspace textual files
   * (e.g. `docs/**`, `package.json`) and assign them to the reserved
   * `root:` graph namespace.
   */
  readonly includePaths?: readonly string[]

  /**
   * Global exclusion patterns applied to file/document discovery.
   *
   * These patterns are relative to the project root and are merged with
   * synthetic spec-root exclusions during effective discovery resolution.
   * Workspace-local excludes are additive on top of this global set.
   */
  readonly excludePaths?: readonly string[]

  /**
   * Per-workspace graph overrides.
   *
   * Keyed by workspace name.
   */
  readonly workspaces?: ReadonlyMap<
    string,
    {
      /**
       * Optional graph-visible include patterns (glob-syntax) relative to codeRoot.
       * When set, only matching paths are eligible for indexing from this workspace.
       */
      readonly allowedPaths?: readonly string[]

      /**
       * Gitignore-syntax exclusion patterns applied during file discovery.
       * These patterns are additive on top of the resolved global exclusion set.
       */
      readonly excludePaths?: readonly string[]

      /**
       * Whether `.gitignore` files are loaded and applied during file discovery.
       * Defaults to `true`. When `false`, only `excludePaths` governs exclusion.
       */
      readonly respectGitignore?: boolean
    }
  >
}

/**
 * Options for configuring a code graph indexing operation.
 */
export interface IndexOptions {
  /**
   * The monorepo or project root directory.
   * Used as the boundary for monorepo package resolution and project-global discovery.
   */
  readonly projectRoot: string

  /**
   * The rich list of workspaces to index.
   * The indexer pulls spec data and implementation coverage directly from
   * each workspace's repository instance.
   */
  readonly workspaces: readonly ProjectWorkspace[]

  /**
   * Project-global graph configuration.
   * Defines global include/exclude paths and per-workspace overrides.
   */
  readonly graphConfig: ProjectGraphConfig

  /**
   * Optional progress reporter callback.
   * Receives percentage (0-100) and phase/detail strings.
   */
  readonly onProgress?: IndexProgressCallback

  /**
   * Maximum byte budget for sequential processing chunks (default 20MB).
   * Files are grouped into chunks to bound peak memory usage during extraction.
   */
  readonly chunkBytes?: number

  /**
   * The VCS ref associated with this indexing run.
   * Stored as `lastIndexedRef` metadata in the graph after success.
   */
  readonly vcsRef?: string

  /**
   * The resolved VCS root associated with this indexing run.
   * Passed through to file discovery and `.gitignore` handling.
   */
  readonly vcsRoot: string | null

  /**
   * Optional code-graph version string for fingerprinting.
   * Used to detect when a full re-index is required due to logic changes.
   */
  readonly codeGraphVersion?: string
}

/**
 * Target workspace to be indexed.
 */
export type WorkspaceIndexTarget = ProjectWorkspace

/**
 * A specification discovered during indexing.
 */
export interface DiscoveredSpec {
  readonly specId: string
  readonly workspace: string
  readonly title: string
  readonly description: string
  readonly metadata: SpecMetadata
}
