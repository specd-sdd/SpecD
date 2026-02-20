/**
 * Base class for all domain and application errors in specd.
 *
 * Every concrete error must provide a machine-readable `code` string
 * for programmatic handling by CLI and MCP adapters.
 */
export abstract class SpecdError extends Error {
  /** Machine-readable error code used for programmatic handling. */
  abstract readonly code: string

  /**
   * Creates a new `SpecdError` with the given message.
   *
   * @param message - Human-readable error description
   */
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}
