import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when graph-store configuration is invalid, such as a
 * non-positive or non-integer `maxPendingOperations` limit.
 */
export class InvalidGraphStoreConfigurationError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'INVALID_GRAPH_STORE_CONFIGURATION'.
   */
  get code(): string {
    return 'INVALID_GRAPH_STORE_CONFIGURATION'
  }

  /**
   * Creates a new InvalidGraphStoreConfigurationError.
   * @param message - Human-readable message describing the invalid configuration.
   */
  constructor(message: string) {
    super(message)
  }
}
