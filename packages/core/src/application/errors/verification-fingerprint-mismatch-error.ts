import { SpecdError } from '../../domain/errors/specd-error.js'
import { type FingerprintDifference } from '../../domain/value-objects/validity-fingerprint.js'

/**
 * Thrown when verification completion observes a fingerprint other than the attempt baseline.
 */
export class VerificationFingerprintMismatchError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'VERIFICATION_FINGERPRINT_MISMATCH'
  }

  private readonly _differences: readonly FingerprintDifference[]

  /**
   * Creates a mismatch error that reports structured differences and no file bytes.
   *
   * @param differences - Baseline versus current fingerprint differences
   */
  constructor(differences: readonly FingerprintDifference[]) {
    super('Verification fingerprint does not match the active attempt baseline')
    this._differences = differences
  }

  /** Baseline versus current fingerprint differences. */
  get differences(): readonly FingerprintDifference[] {
    return this._differences
  }
}
