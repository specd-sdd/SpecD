/**
 * The lifecycle state of a `Change`.
 *
 * Valid transitions are defined in `VALID_TRANSITIONS`.
 */
export type ChangeState =
  | 'drafting'
  | 'designing'
  | 'ready'
  | 'pending-spec-approval'
  | 'spec-approved'
  | 'implementing'
  | 'verifying'
  | 'done'
  | 'pending-signoff'
  | 'signed-off'
  | 'archivable'
  | 'archiving'

/**
 * Defines all permitted state transitions for the change lifecycle.
 *
 * Each key is a source state; the value is the array of states it may
 * transition to. Transitions not listed here are invalid.
 *
 * Pending and approved parking states remain drain-only for in-flight
 * changes. New work stays in `ready` / `done` until recorded approval
 * unblocks the delivery edge.
 */
export const VALID_TRANSITIONS: Record<ChangeState, readonly ChangeState[]> = {
  drafting: ['designing'],
  designing: ['ready', 'designing'],
  ready: ['implementing', 'designing'],
  'pending-spec-approval': ['spec-approved', 'designing'],
  'spec-approved': ['implementing', 'designing'],
  implementing: ['verifying', 'designing'],
  verifying: ['implementing', 'done', 'designing'],
  done: ['archivable', 'designing', 'implementing', 'verifying'],
  'pending-signoff': ['signed-off', 'designing'],
  'signed-off': ['archivable', 'designing', 'implementing', 'verifying'],
  archivable: ['archiving', 'designing', 'implementing', 'verifying'],
  archiving: ['archivable', 'designing'],
}

/**
 * Happy-path next lifecycle state for `TransitionChange` `to: 'next'`.
 * Not `GetStatus.nextAction` (that field may recommend staying, approving, or archiving).
 */
export const HAPPY_PATH_NEXT: Partial<Record<ChangeState, ChangeState>> = {
  drafting: 'designing',
  designing: 'ready',
  ready: 'implementing',
  'spec-approved': 'implementing',
  implementing: 'verifying',
  verifying: 'done',
  done: 'archivable',
  'signed-off': 'archivable',
}

/**
 * Returns whether transitioning from `from` to `to` is a valid lifecycle move.
 *
 * @param from - The current state
 * @param to - The proposed next state
 * @returns `true` if the transition is permitted, `false` otherwise
 */
export function isValidTransition(from: ChangeState, to: ChangeState): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}
