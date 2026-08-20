import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a bulk index session operation is attempted while the
 * session is in a state that does not allow it (already active, already
 * finished, or committing/rolling back).
 */
export class BulkSessionStateError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'BULK_SESSION_STATE'.
   */
  get code(): string {
    return 'BULK_SESSION_STATE'
  }

  /**
   * Creates a new BulkSessionStateError.
   * @param message - Human-readable message describing the invalid session state.
   */
  constructor(message: string) {
    super(message)
  }
}
