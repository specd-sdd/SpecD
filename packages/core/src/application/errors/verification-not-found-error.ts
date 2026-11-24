import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when an operation requires completed verification evidence and none exists.
 */
export class VerificationNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'VERIFICATION_NOT_FOUND'
  }

  /**
   * Creates the error for a change without completed verification.
   *
   * @param name - Change name
   */
  constructor(name: string) {
    super(`Change '${name}' has no completed verification`)
  }
}
