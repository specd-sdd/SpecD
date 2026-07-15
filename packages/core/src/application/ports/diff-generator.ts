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
 * Raised when unified diff generation fails after merge content is already available.
 */
export class DiffGenerationError extends Error {
  /**
   * Creates a typed diff-generation failure.
   *
   * @param message - Human-readable failure description
   * @param options - Optional error cause
   * @param options.cause - Underlying diff-generation failure, when available
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'DiffGenerationError'
    if (options?.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: true,
        writable: true,
      })
    }
  }
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
