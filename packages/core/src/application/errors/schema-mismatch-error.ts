import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a change was created with a different schema than the currently
 * active one. A schema *name* mismatch indicates structural incompatibility
 * (different artifact types, formats, delta rules, validations).
 */
export class SchemaMismatchError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SCHEMA_MISMATCH'
  }

  /**
   * Creates a new `SchemaMismatchError` instance.
   *
   * @param changeName - The name of the change
   * @param expected - The schema name recorded in the change's `created` event
   * @param actual - The currently active schema name
   */
  constructor(changeName: string, expected: string, actual: string) {
    super(
      `Change '${changeName}' was created with schema '${expected}' but the active schema is '${actual}'. Cannot operate on a change with an incompatible schema.`,
    )
  }
}
