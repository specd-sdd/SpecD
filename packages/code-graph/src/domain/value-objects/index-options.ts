/**
 * Progress callback invoked during indexing to report completion percentage and phase.
 * @param percent - Completion percentage (0-100).
 * @param phase - Current phase description.
 */
export type IndexProgressCallback = (percent: number, phase: string) => void

/**
 * Options for configuring a code graph indexing operation.
 */
export interface IndexOptions {
  readonly workspacePath: string
  /** Optional callback invoked to report indexing progress. */
  readonly onProgress?: IndexProgressCallback
  /** Maximum source bytes per processing chunk. Defaults to 20MB. */
  readonly chunkBytes?: number
}
