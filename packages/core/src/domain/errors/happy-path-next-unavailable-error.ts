import { SpecdError } from './specd-error.js'
import { type ChangeState } from '../value-objects/change-state.js'

/**
 * Thrown when `TransitionChange` receives `to: 'next'` and the current state
 * has no happy-path lifecycle hop.
 */
export class HappyPathNextUnavailableError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'HAPPY_PATH_NEXT_UNAVAILABLE'
  }

  /**
   * Creates an error for a state that cannot use `to: 'next'`.
   *
   * @param state - Current change state
   */
  constructor(state: ChangeState) {
    super(happyPathNextMessage(state))
  }
}

/**
 * Human explanation for why `--next` / `to: 'next'` cannot run.
 *
 * @param state - Current change state
 * @returns CLI-facing error message
 */
export function happyPathNextMessage(state: ChangeState): string {
  switch (state) {
    case 'pending-spec-approval':
      return 'cannot advance with --next: change is waiting for human spec approval'
    case 'pending-signoff':
      return 'cannot advance with --next: change is waiting for human signoff'
    case 'archivable':
      return 'cannot advance with --next: archiving is not a lifecycle transition'
    case 'archiving':
      return 'cannot advance with --next: archiving is a terminal state'
    default:
      return `cannot advance with --next: no happy-path hop from '${state}'`
  }
}
