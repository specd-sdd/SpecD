import { SpecdError } from '../../domain/errors/specd-error.js'

/** Thrown when sign-off depends on stale or legacy-unknown verification evidence. */
export class VerificationStaleError extends SpecdError {
  /** Stable machine-readable error code. */
  override get code(): string {
    return 'VERIFICATION_STALE'
  }

  /**
   * Creates the stale-verification error.
   *
   * @param name - Change whose completed verification is stale
   */
  constructor(name: string) {
    super(`Verification for change '${name}' is stale; run /specd-verify before sign-off`)
  }
}
