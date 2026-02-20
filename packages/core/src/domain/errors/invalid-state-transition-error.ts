import { SpecdError } from './specd-error.js'

/**
 * Thrown when a state transition is attempted that is not permitted
 * by the change lifecycle defined in `ChangeState`.
 */
export class InvalidStateTransitionError extends SpecdError {
  /** @inheritdoc */
  readonly code = 'INVALID_STATE_TRANSITION'

  /**
   * Creates a new `InvalidStateTransitionError` for the given transition attempt.
   *
   * @param from - The current state of the change
   * @param to - The target state that was rejected
   */
  constructor(from: string, to: string) {
    super(`Cannot transition from '${from}' to '${to}'`)
  }
}
