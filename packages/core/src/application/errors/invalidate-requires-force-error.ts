import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when invalidation would clear an active approval/signoff without `--force`.
 */
export class InvalidateRequiresForceError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALIDATE_REQUIRES_FORCE'
  }

  /**
   * Creates a new `InvalidateRequiresForceError` instance.
   */
  constructor() {
    super(
      'Change has an active approval or signoff. Use --force to return the change to designing and invalidate the active approval/signoff.',
    )
  }
}
