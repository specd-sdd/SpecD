import { SpecdError } from './specd-error.js'
import { type ChangeState } from '../value-objects/change-state.js'

/**
 * Thrown when `TransitionChange` receives `to: 'next'` and the current state
 * has no happy-path lifecycle hop.
 */
export class HappyPathNextUnavailableError extends SpecdError {
  private readonly _state: ChangeState

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'HAPPY_PATH_NEXT_UNAVAILABLE'
  }

  /** Current change state that blocked advancing to the next happy-path state. */
  get state(): ChangeState {
    return this._state
  }

  /**
   * Creates an error for a state that cannot use `to: 'next'`.
   *
   * @param state - Current change state
   */
  constructor(state: ChangeState) {
    super(happyPathNextMessage(state))
    this._state = state
  }
}

/**
 * Human explanation for why `to: 'next'` cannot run.
 *
 * @param state - Current change state
 * @returns Host-neutral error message
 */
export function happyPathNextMessage(state: ChangeState): string {
  switch (state) {
    case 'archivable':
      return 'cannot advance to next state: archiving is not a lifecycle transition'
    case 'archiving':
      return 'cannot advance to next state: archiving is a terminal state'
    default:
      return `cannot advance to next state: no happy-path hop from '${state}'`
  }
}
