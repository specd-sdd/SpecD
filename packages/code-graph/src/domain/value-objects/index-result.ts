/**
 * Describes an error encountered while indexing a specific file.
 */
export interface IndexError {
  readonly filePath: string
  readonly message: string
}

/**
 * Per-workspace breakdown of indexing results.
 */
export interface WorkspaceIndexBreakdown {
  readonly name: string
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly filesSkipped: number
  readonly filesRemoved: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
}

/**
 * Summary of an indexing operation including counts and errors.
 */
export interface IndexResult {
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly filesRemoved: number
  readonly filesSkipped: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
  readonly errors: readonly IndexError[]
  readonly duration: number
  readonly workspaces: readonly WorkspaceIndexBreakdown[]
}
