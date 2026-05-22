import { SpecdError } from '@specd/core'

/**
 * Base class for all CLI-specific errors.
 */
export abstract class SpecdCliError extends SpecdError {
  /**
   * Creates a new `SpecdCliError` with the given message.
   *
   * @param message - Human-readable error description
   */
  constructor(message: string) {
    super(message)
  }
}
