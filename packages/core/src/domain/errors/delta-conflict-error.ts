import { SpecdError } from './specd-error.js'

export class DeltaConflictError extends SpecdError {
  readonly code = 'DELTA_CONFLICT'

  constructor(message: string) {
    super(message)
  }
}
