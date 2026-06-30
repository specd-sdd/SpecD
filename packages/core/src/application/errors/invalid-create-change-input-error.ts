import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when {@link CreateChange} input violates schema identity rules.
 */
export class InvalidCreateChangeInputError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_CREATE_CHANGE_INPUT'
  }

  /**
   * Creates a new `InvalidCreateChangeInputError` instance.
   *
   * @param message - Human-readable explanation of the invalid input
   */
  constructor(message: string) {
    super(message)
  }
}
