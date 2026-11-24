import { SpecdError } from '../../domain/errors/specd-error.js'
import { type FingerprintInputFailure } from '../../domain/services/change-validity.js'

/**
 * Thrown when a fingerprint cannot be completed because an input is missing,
 * unreadable, outside the project, or not a safe relative path.
 */
export class FingerprintInputError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'FINGERPRINT_INPUT_ERROR'
  }

  private readonly _failures: readonly FingerprintInputFailure[]

  /**
   * Creates a fingerprint input error.
   *
   * @param failures - Typed input failures, without file bytes
   */
  constructor(failures: readonly FingerprintInputFailure[]) {
    const keys = failures.map((failure) => failure.key).join(', ')
    super(`Fingerprint inputs could not be read: ${keys}`)
    this._failures = failures
  }

  /** Typed input failures, without file bytes. */
  get failures(): readonly FingerprintInputFailure[] {
    return this._failures
  }
}
