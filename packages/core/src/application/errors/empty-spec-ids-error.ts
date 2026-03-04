import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when an edit would leave the change with no spec IDs.
 */
export class EmptySpecIdsError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'EMPTY_SPEC_IDS'
  }

  /**
   * Creates a new `EmptySpecIdsError` instance.
   *
   * @param changeName - The change name
   */
  constructor(changeName: string) {
    super(`Editing change '${changeName}' would leave specIds empty`)
  }
}
