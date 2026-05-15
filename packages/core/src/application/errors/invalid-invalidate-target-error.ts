import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when manual invalidation targets are semantically invalid.
 */
export class InvalidInvalidateTargetError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_INVALIDATE_TARGET'
  }

  /**
   * Creates a new `InvalidInvalidateTargetError` instance.
   *
   * @param errors - One or more concrete target validation failures
   */
  constructor(errors: readonly string[]) {
    super(`Invalid targets:\n${errors.map((error) => `  - ${error}`).join('\n')}`)
  }
}
