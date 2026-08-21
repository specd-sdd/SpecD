import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a graph selector is invalid, for example an empty file or
 * symbol selector.
 */
export class InvalidGraphSelectorError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'INVALID_GRAPH_SELECTOR'.
   */
  get code(): string {
    return 'INVALID_GRAPH_SELECTOR'
  }

  /**
   * Creates a new InvalidGraphSelectorError.
   * @param message - The descriptive validation failure message.
   */
  constructor(message: string) {
    super(message)
  }
}
