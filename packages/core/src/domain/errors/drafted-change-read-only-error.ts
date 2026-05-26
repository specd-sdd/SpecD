import { SpecdError } from './specd-error.js'

/**
 * Thrown when a drafted change is mutated outside `mutateDraft` or allowed restore/discard flows.
 */
export class DraftedChangeReadOnlyError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'DRAFTED_CHANGE_READ_ONLY'
  }

  /**
   * Creates a new `DraftedChangeReadOnlyError`.
   *
   * @param changeName - The drafted change name
   * @param operation - The persistence operation that was rejected (e.g. `save`, `saveArtifact`)
   */
  constructor(
    readonly changeName: string,
    readonly operation: string,
  ) {
    super(
      `Change '${changeName}' is drafted and read-only until restored. Cannot ${operation} outside mutateDraft.`,
    )
  }
}
