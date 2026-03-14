/**
 * Base error class for all code-graph domain errors.
 */
export abstract class CodeGraphError extends Error {
  /**
   * Returns the machine-readable error code for this error type.
   * @returns The error code string.
   */
  abstract get code(): string

  /**
   * Creates a new CodeGraphError with the given message.
   * @param message - The human-readable error message.
   */
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}
