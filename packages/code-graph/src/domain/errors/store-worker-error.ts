import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when the SQLite worker thread encounters an unhandled error or crashes unexpectedly.
 */
export class StoreWorkerError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'STORE_WORKER_ERROR'.
   */
  get code(): string {
    return 'STORE_WORKER_ERROR'
  }

  /**
   * Creates a new StoreWorkerError.
   * @param message - Custom error message describing the worker failure.
   */
  constructor(message = 'SQLite worker encountered an error') {
    super(message)
  }
}
