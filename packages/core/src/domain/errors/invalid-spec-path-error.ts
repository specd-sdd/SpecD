import { SpecdError } from './specd-error.js'

/**
 * Thrown when a spec path string is syntactically invalid
 * (e.g. empty, contains `.` or `..` segments, or uses reserved characters).
 */
export class InvalidSpecPathError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_SPEC_PATH'
  }

  /**
   * Creates a new `InvalidSpecPathError` with the given reason.
   *
   * @param reason - Description of why the path is invalid
   */
  constructor(reason: string) {
    super(`Invalid spec path: ${reason}`)
  }
}
