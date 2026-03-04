import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when attempting to remove a spec that is not in the change's specIds.
 */
export class SpecNotInChangeError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SPEC_NOT_IN_CHANGE'
  }

  /**
   * Creates a new `SpecNotInChangeError` instance.
   *
   * @param specId - The spec path that was not found in the change
   * @param changeName - The change name
   */
  constructor(specId: string, changeName: string) {
    super(`Spec '${specId}' is not in the current specIds of change '${changeName}'`)
  }
}
