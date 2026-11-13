import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when the path given to a path explanation is empty or unusable.
 */
export class InvalidGraphWhyPathError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code `INVALID_GRAPH_WHY_PATH`.
   */
  get code(): string {
    return 'INVALID_GRAPH_WHY_PATH'
  }

  /**
   * Creates a new InvalidGraphWhyPathError.
   * @param input - The rejected path input.
   */
  constructor(input: string) {
    super(`Invalid path for graph explanation: '${input}'`)
  }
}
