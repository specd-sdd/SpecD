import { SpecdError } from './specd-error.js'

export class ApprovalRequiredError extends SpecdError {
  readonly code = 'APPROVAL_REQUIRED'

  constructor(changeName: string) {
    super(`Change '${changeName}' has structural spec modifications and requires approval before archiving`)
  }
}
