import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Thrown when physical graph-store recreation is attempted while resources are open.
 */
export class GraphStoreRecreateRequiresClosedError extends SpecdCodeGraphError {
  /** Returns the stable machine-readable error code. */
  override get code(): string {
    return 'GRAPH_STORE_RECREATE_REQUIRES_CLOSED'
  }

  /**
   * Creates the closed-store recreation precondition error.
   * @param message - Optional actionable message.
   */
  constructor(message = 'Graph storage must be closed before it can be recreated.') {
    super(message)
  }
}
