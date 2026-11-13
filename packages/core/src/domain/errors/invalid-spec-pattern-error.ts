import { SpecdError } from './specd-error.js'

/**
 * Thrown when a context include/exclude pattern fails grammar validation.
 */
export class InvalidSpecPatternError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_SPEC_PATTERN'
  }

  /**
   * Creates a new `InvalidSpecPatternError`.
   *
   * @param pattern - The original (invalid) pattern string
   * @param reason - Description of why the pattern is invalid
   */
  constructor(
    readonly pattern: string,
    readonly reason: string,
  ) {
    super(`Invalid spec pattern '${pattern}': ${reason}`)
  }
}
