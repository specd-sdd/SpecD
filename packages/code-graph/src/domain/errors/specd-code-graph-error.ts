import { SpecdError } from '@specd/core'

/**
 * Base error class for all code-graph domain errors.
 */
export abstract class SpecdCodeGraphError extends SpecdError {
  /**
   * Returns the machine-readable error code for this error type.
   * @returns The error code string.
   */
  abstract override get code(): string

  /**
   * Creates a new SpecdCodeGraphError with the given message.
   * @param message - The human-readable error message.
   */
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}
