import { SpecdError } from './specd-error.js'

/**
 * Thrown when a schema file fails structural validation during
 * `SchemaRegistry.resolve()`.
 *
 * Carries the schema reference that triggered the failure and a human-readable
 * reason describing which constraint was violated.
 */
export class SchemaValidationError extends SpecdError {
  private readonly _ref: string
  private readonly _reason: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'SCHEMA_VALIDATION_ERROR'
  }

  /**
   * Creates a new `SchemaValidationError` for a schema that failed validation.
   *
   * @param ref - The schema reference string (e.g. `"@specd/schema-std"`, `"#billing:my-schema"`)
   * @param reason - A human-readable description of the violated constraint
   */
  constructor(ref: string, reason: string) {
    super(`Schema '${ref}' is invalid: ${reason}`)
    this._ref = ref
    this._reason = reason
  }

  /**
   * The schema reference that failed validation.
   *
   * @returns The original ref string passed to `SchemaRegistry.resolve()`
   */
  get ref(): string {
    return this._ref
  }

  /**
   * A human-readable description of the violated constraint.
   *
   * @returns The validation failure reason
   */
  get reason(): string {
    return this._reason
  }
}
