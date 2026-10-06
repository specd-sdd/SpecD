import { SpecdError } from './specd-error.js'

/**
 * Thrown when attempting to add a spec to a change whose schema is incompatible
 * with the change's schema.
 */
export class IncompatibleSchemaError extends SpecdError {
  private readonly _specId: string
  private readonly _specSchema: string
  private readonly _changeSchema: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'INCOMPATIBLE_SCHEMA'
  }

  /**
   * Creates a new `IncompatibleSchemaError`.
   *
   * @param specId - Canonical spec ID of the incompatible spec
   * @param specSchema - The schema name of the spec
   * @param changeSchema - The schema name of the change
   */
  constructor(specId: string, specSchema: string, changeSchema: string) {
    super(
      `Spec '${specId}' has schema '${specSchema}' which is incompatible with change schema '${changeSchema}'`,
    )
    this._specId = specId
    this._specSchema = specSchema
    this._changeSchema = changeSchema
  }

  /** Canonical spec ID of the incompatible spec. */
  get specId(): string {
    return this._specId
  }

  /** The schema name of the spec. */
  get specSchema(): string {
    return this._specSchema
  }

  /** The schema name of the change. */
  get changeSchema(): string {
    return this._changeSchema
  }
}
