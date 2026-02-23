import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when an approval operation is attempted but the corresponding
 * approval gate is disabled in the active configuration.
 */
export class ApprovalGateDisabledError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'APPROVAL_GATE_DISABLED'
  }

  /**
   * @param gate - The gate that is disabled (`'spec'` or `'signoff'`)
   */
  constructor(gate: 'spec' | 'signoff') {
    super(`Approval gate '${gate}' is not enabled in the active configuration`)
  }
}
