import { SpecdError } from './specd-error.js'

/**
 * Thrown when attempting to archive a change that contains structural spec
 * modifications but has not yet been approved.
 */
export class ApprovalRequiredError extends SpecdError {
  /** @inheritdoc */
  readonly code = 'APPROVAL_REQUIRED'

  /**
   * Creates a new `ApprovalRequiredError` for the given change.
   *
   * @param changeName - The name of the change that requires approval
   */
  constructor(changeName: string) {
    super(
      `Change '${changeName}' has structural spec modifications and requires approval before archiving`,
    )
  }
}
