import { type SpecNode } from './spec-node.js'

/**
 * Progress callback invoked during indexing to report completion percentage and phase.
 * @param percent - Completion percentage (0-100).
 * @param phase - Current phase description.
 */
export type IndexProgressCallback = (percent: number, phase: string) => void

/**
 * A discovered spec ready for indexing.
 */
export interface DiscoveredSpec {
  readonly spec: SpecNode
  readonly contentHash: string
}

/**
 * Represents a workspace to be indexed with its code root and spec source.
 */
export interface WorkspaceIndexTarget {
  /** Workspace name (e.g. 'core', 'cli'). */
  readonly name: string
  /** Absolute path to the workspace's code root directory. */
  readonly codeRoot: string
  /** Callback that returns discovered specs for this workspace. */
  readonly specs: () => Promise<DiscoveredSpec[]>
  /** Optional repository root, used as boundary when searching for package manifests. */
  readonly repoRoot?: string
}

/**
 * Options for configuring a code graph indexing operation.
 */
export interface IndexOptions {
  /** Workspaces to index. */
  readonly workspaces: readonly WorkspaceIndexTarget[]
  /** Absolute path to the project root (for monorepo package resolution). */
  readonly projectRoot: string
  /** Optional callback invoked to report indexing progress. */
  readonly onProgress?: IndexProgressCallback
  /** Maximum source bytes per processing chunk. Defaults to 20MB. */
  readonly chunkBytes?: number
}
