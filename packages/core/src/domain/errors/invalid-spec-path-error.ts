import { SpecdError } from './specd-error.js'

/**
 * Thrown when a spec path string is syntactically invalid
 * (e.g. empty, contains `.` or `..` segments, or uses reserved characters).
 */
export class InvalidSpecPathError extends SpecdError {
  /** @inheritdoc */
  readonly code = 'INVALID_SPEC_PATH'

  /**
   * Creates a new `InvalidSpecPathError` with the given reason.
   *
   * @param reason - Description of why the path is invalid
   */
  constructor(reason: string) {
    super(`Invalid spec path: ${reason}`)
  }
}
