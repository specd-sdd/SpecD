import { CodeGraphError } from './code-graph-error.js'

/**
 * Error thrown when an operation is attempted on a graph store that has not been opened.
 */
export class StoreNotOpenError extends CodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'STORE_NOT_OPEN'.
   */
  get code(): string {
    return 'STORE_NOT_OPEN'
  }

  /**
   * Creates a new StoreNotOpenError.
   */
  constructor() {
    super('Graph store is not open. Call open() before performing operations.')
  }
}
