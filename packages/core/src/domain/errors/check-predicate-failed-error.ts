import { SpecdError } from './specd-error.js'

/**
 * Thrown when a predicate check fails during lifecycle transition or preflight evaluation.
 */
export class CheckPredicateFailedError extends SpecdError {
  /**
   * Diagnostic error code identifying the specific check failure condition.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return this.checkCode
  }

  /**
   * Creates a new CheckPredicateFailedError.
   *
   * @param checkId - Canonical identifier of the failed check
   * @param label - Gerund label of the failed check
   * @param checkCode - Machine-readable failure code
   * @param message - Diagnostic failure explanation
   * @param command - Suggested repair command
   * @param details - Structured context payload
   * @param skippable - Whether the check may be bypassed via --skip-checks
   */
  constructor(
    public readonly checkId: string,
    public readonly label: string,
    public readonly checkCode: string,
    message: string,
    public readonly command?: string,
    public readonly details?: Readonly<Record<string, unknown>>,
    public readonly skippable?: boolean,
  ) {
    super(`Check '${checkId}' failed: ${message}`)
    this.name = 'CheckPredicateFailedError'
  }
}
