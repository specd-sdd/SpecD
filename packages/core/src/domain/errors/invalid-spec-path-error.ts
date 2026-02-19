import { SpecdError } from './specd-error.js'

export class InvalidSpecPathError extends SpecdError {
  readonly code = 'INVALID_SPEC_PATH'

  constructor(reason: string) {
    super(`Invalid spec path: ${reason}`)
  }
}
