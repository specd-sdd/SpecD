import { SpecdError } from './specd-error.js'

/**
 * Thrown when invalid input is provided to a core use case.
 */
export class InvalidInputError extends SpecdError {
  /**
   * Creates a new InvalidInputError.
   * @param message - The error message.
   */
  constructor(message: string) {
    super(message)
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  get code(): string {
    return 'INVALID_INPUT'
  }
}
