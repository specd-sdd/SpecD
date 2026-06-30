import { SpecdCliError } from './specd-cli-error.js'

/**
 * Thrown when `--format` receives an unrecognised value.
 */
export class InvalidFormatError extends SpecdCliError {
  /**
   * Returns the machine-readable error code.
   *
   * @returns 'INVALID_FORMAT'
   */
  get code(): string {
    return 'INVALID_FORMAT'
  }

  /**
   * Creates a new `InvalidFormatError`.
   *
   * @param message - Validation failure details
   */
  constructor(message: string) {
    super(message)
  }
}
