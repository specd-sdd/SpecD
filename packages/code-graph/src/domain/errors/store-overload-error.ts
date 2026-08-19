import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when SQLite graph store operation queue is overloaded / exceeds backpressure capacity.
 */
export class StoreOverloadError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'STORE_OVERLOAD'.
   */
  get code(): string {
    return 'STORE_OVERLOAD'
  }

  /**
   * Creates a new StoreOverloadError.
   * @param messageOrPending - Custom error message or pending operation count.
   * @param maxPending - Maximum pending operations limit if first argument is count.
   */
  constructor(
    messageOrPending: string | number = 'SQLite operation queue overloaded',
    maxPending?: number,
  ) {
    const message =
      typeof messageOrPending === 'number'
        ? `SQLite operation queue overloaded (${messageOrPending} pending operations exceed limit of ${maxPending ?? messageOrPending})`
        : messageOrPending
    super(message)
  }
}
