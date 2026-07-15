/**
 * Input for generating a unified diff between preview file contents.
 */
export interface DiffGeneratorInput {
  /** The previewed artifact filename. */
  readonly filename: string
  /** The original base content before merge. */
  readonly base: string
  /** The merged content after applying the change. */
  readonly merged: string
  /** Optional number of context lines around changes. */
  readonly contextLines?: number
}

/**
 * Generates plain unified diff text for preview file contents.
 */
export interface DiffGenerator {
  /**
   * Produces a unified diff string from preview file content.
   *
   * @param input - The preview file content to diff
   * @returns A plain unified diff string
   */
  generate(input: DiffGeneratorInput): string
}
