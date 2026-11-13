import { SpecdError } from './specd-error.js'

/**
 * Thrown when a spec ID string fails canonical syntax validation.
 */
export class InvalidSpecIdError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_SPEC_ID'
  }

  /**
   * Creates a new `InvalidSpecIdError`.
   *
   * @param value - The original (invalid) spec ID string
   * @param reason - Description of why the ID is invalid
   * @param segment - Optional offending capability-path segment
   */
  constructor(
    readonly value: string,
    readonly reason: string,
    readonly segment?: string,
  ) {
    super(`Invalid spec ID '${value}': ${reason}`)
  }
}
