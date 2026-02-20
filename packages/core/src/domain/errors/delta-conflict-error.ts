import { SpecdError } from './specd-error.js'

/**
 * Thrown when a delta spec contains conflicting operations for the same block
 * (e.g. a block listed in both MODIFIED and REMOVED, or a RENAMED FROM name
 * referenced again in MODIFIED).
 */
export class DeltaConflictError extends SpecdError {
  /** @inheritdoc */
  readonly code = 'DELTA_CONFLICT'

  /**
   * Creates a new `DeltaConflictError` with a description of the conflict.
   *
   * @param message - Description of the specific conflict detected
   */
  constructor(message: string) {
    super(message)
  }
}
