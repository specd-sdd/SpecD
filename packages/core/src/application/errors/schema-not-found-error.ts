import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a schema reference cannot be resolved by {@link SchemaRegistry}.
 */
export class SchemaNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SCHEMA_NOT_FOUND'
  }

  /**
   * @param ref - The schema reference that could not be resolved
   */
  constructor(ref: string) {
    super(`Schema '${ref}' not found`)
  }
}
