import { SpecdError } from '../../domain/errors/specd-error.js'

/** Thrown when sign-off is requested while verification has not completed. */
export class VerificationInProgressError extends SpecdError {
  /** Stable machine-readable error code. */
  override get code(): string {
    return 'VERIFICATION_IN_PROGRESS'
  }

  /**
   * Creates the active-attempt error.
   *
   * @param name - Change with an active verification attempt
   */
  constructor(name: string) {
    super(`Change '${name}' has an active verification attempt that is not completed`)
  }
}
