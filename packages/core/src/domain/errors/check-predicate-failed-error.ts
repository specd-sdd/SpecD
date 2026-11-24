import { type CheckAction } from '../services/transition-checks.js'
import { type ChangeState } from '../value-objects/change-state.js'
import { SpecdError } from './specd-error.js'

/** Optional transition context for a failed predicate check. */
export interface CheckPredicateFailedOptions {
  /** Source lifecycle state of the attempted transition or archive. */
  readonly from?: ChangeState
  /** Target lifecycle state of the attempted transition or archive. */
  readonly to?: ChangeState
}

/**
 * Thrown when a predicate check fails during lifecycle transition or preflight evaluation.
 */
export class CheckPredicateFailedError extends SpecdError {
  private readonly _from?: ChangeState
  private readonly _to?: ChangeState

  /** Source lifecycle state of the attempted transition or archive, when applicable. */
  get from(): ChangeState | undefined {
    return this._from
  }

  /** Target lifecycle state of the attempted transition or archive, when applicable. */
  get to(): ChangeState | undefined {
    return this._to
  }

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
   * @param action - Optional host-neutral remediation action
   * @param details - Structured context payload
   * @param skippable - Whether the check may be bypassed through the orchestrator's check-bypass input
   * @param options - Optional attempted hop (`from` and `to`)
   */
  constructor(
    public readonly checkId: string,
    public readonly label: string,
    public readonly checkCode: string,
    message: string,
    public readonly action?: CheckAction,
    public readonly details?: Readonly<Record<string, unknown>>,
    public readonly skippable?: boolean,
    options?: CheckPredicateFailedOptions,
  ) {
    super(`Check '${checkId}' failed: ${message}`)
    this.name = 'CheckPredicateFailedError'
    if (options?.from !== undefined) {
      this._from = options.from
    }
    if (options?.to !== undefined) {
      this._to = options.to
    }
  }
}
