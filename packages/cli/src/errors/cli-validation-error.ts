import { SpecdCliError } from './specd-cli-error.js'

/**
 * Thrown when CLI input validation fails.
 */
export class CliValidationError extends SpecdCliError {
  /**
   * Returns the machine-readable error code.
   *
   * @returns 'CLI_VALIDATION_ERROR'
   */
  get code(): string {
    return 'CLI_VALIDATION_ERROR'
  }

  /**
   * Creates a new `CliValidationError`.
   *
   * @param message - Validation failure details
   */
  constructor(message: string) {
    super(message)
  }
}
