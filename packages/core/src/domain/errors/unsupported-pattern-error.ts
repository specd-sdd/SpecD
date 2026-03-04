import { SpecdError } from './specd-error.js'

/**
 * Thrown when an archive pattern contains an unsupported variable.
 *
 * For example, `{{change.scope}}` is explicitly unsupported because scope
 * paths contain `/` which produces ambiguous directory names.
 */
export class UnsupportedPatternError extends SpecdError {
  private readonly _variable: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'UNSUPPORTED_PATTERN_ERROR'
  }

  /** The unsupported pattern variable that caused the error. */
  get variable(): string {
    return this._variable
  }

  /**
   * Creates a new `UnsupportedPatternError`.
   *
   * @param variable - The unsupported pattern variable (e.g. `'{{change.scope}}'`)
   * @param reason - Human-readable explanation of why the variable is unsupported
   */
  constructor(variable: string, reason: string) {
    super(`Archive pattern variable ${variable} is not supported — ${reason}`)
    this._variable = variable
  }
}
