import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a requested spec does not exist in the repository.
 */
export class SpecNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SPEC_NOT_FOUND'
  }

  /**
   * Creates a new `SpecNotFoundError` instance.
   *
   * @param specId - The spec identifier that was not found
   */
  constructor(specId: string) {
    super(`Spec '${specId}' not found`)
  }
}
