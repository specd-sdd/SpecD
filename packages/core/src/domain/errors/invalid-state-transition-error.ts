import { SpecdError } from './specd-error.js'

export class InvalidStateTransitionError extends SpecdError {
  readonly code = 'INVALID_STATE_TRANSITION'

  constructor(from: string, to: string) {
    super(`Cannot transition from '${from}' to '${to}'`)
  }
}
