import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when saving a change artifact would clear an active approval/signoff without `force`.
 */
export class SaveRequiresForceError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SAVE_REQUIRES_FORCE'
  }

  /** Creates a new `SaveRequiresForceError` instance. */
  constructor() {
    super(
      'Change has an active approval or signoff. Pass force: true to save and invalidate the active approval/signoff.',
    )
  }
}
