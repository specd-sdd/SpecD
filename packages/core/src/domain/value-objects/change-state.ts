/**
 * The lifecycle state of a `Change`.
 *
 * Valid transitions are defined in `VALID_TRANSITIONS`.
 */
export type ChangeState =
  | 'drafting'
  | 'designing'
  | 'ready'
  | 'implementing'
  | 'done'
  | 'pending-approval'
  | 'approved'
  | 'archivable'

/**
 * Defines all permitted state transitions for the change lifecycle.
 *
 * Each key is a source state; the value is the array of states it may
 * transition to. Transitions not listed here are invalid.
 */
export const VALID_TRANSITIONS: Record<ChangeState, readonly ChangeState[]> = {
  drafting: ['designing'],
  designing: ['ready'],
  ready: ['implementing'],
  implementing: ['done'],
  done: ['pending-approval', 'archivable'],
  'pending-approval': ['approved'],
  approved: ['archivable'],
  archivable: [],
}

/**
 * Returns whether transitioning from `from` to `to` is a valid lifecycle move.
 *
 * @param from - The current state
 * @param to - The proposed next state
 * @returns `true` if the transition is permitted, `false` otherwise
 */
export function isValidTransition(from: ChangeState, to: ChangeState): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to)
}
