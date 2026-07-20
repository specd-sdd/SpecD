import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error raised when the graph is temporarily unavailable due to active indexing.
 */
export class GraphBusyError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code string.
   */
  override get code(): string {
    return 'GRAPH_BUSY'
  }

  /**
   * Creates a new GraphBusyError.
   *
   * @param message - Human-readable message.
   */
  constructor(message: string) {
    super(message)
  }
}
