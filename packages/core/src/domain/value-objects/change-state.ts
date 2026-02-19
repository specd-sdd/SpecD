export type ChangeState =
  | 'drafting'
  | 'designing'
  | 'ready'
  | 'implementing'
  | 'done'
  | 'pending-approval'
  | 'approved'
  | 'archivable'

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

export function isValidTransition(from: ChangeState, to: ChangeState): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to)
}
