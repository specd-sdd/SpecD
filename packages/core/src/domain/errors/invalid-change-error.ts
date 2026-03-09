import { SpecdError } from './specd-error.js'

/**
 * Thrown when a `Change` is constructed with invalid properties
 * that violate domain invariants (e.g. empty workspaces or specIds).
 */
export class InvalidChangeError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_CHANGE'
  }

  /**
   * Creates a new `InvalidChangeError`.
   *
   * @param message - Description of the invariant violation
   */
  constructor(message: string) {
    super(message)
  }
}
