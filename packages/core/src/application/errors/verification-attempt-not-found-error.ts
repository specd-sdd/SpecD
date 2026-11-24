import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when verification completion is requested and no active attempt exists.
 */
export class VerificationAttemptNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'VERIFICATION_ATTEMPT_NOT_FOUND'
  }

  /**
   * Creates the error for a change with no active verification attempt.
   *
   * @param name - Change name
   */
  constructor(name: string) {
    super(`Change '${name}' has no active verification attempt`)
  }
}
