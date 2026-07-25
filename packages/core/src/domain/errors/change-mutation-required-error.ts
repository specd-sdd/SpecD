import { SpecdError } from './specd-error.js'

/**
 * Thrown when a change persistence operation requires an active `mutate` or
 * `mutateDraft` window and the caller invoked it outside that scope.
 */
export class ChangeMutationRequiredError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CHANGE_MUTATION_REQUIRED'
  }

  /**
   * Creates a new `ChangeMutationRequiredError`.
   *
   * @param changeName - The change name
   * @param operation - The persistence operation that was rejected (e.g. `saveArtifact`)
   */
  constructor(
    readonly changeName: string,
    readonly operation: string,
  ) {
    super(
      `Change '${changeName}' requires an active mutate window. Cannot ${operation} outside mutate or mutateDraft.`,
    )
  }
}
