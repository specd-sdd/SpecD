import { SpecdError } from './specd-error.js'

/** The operation that was blocked by the historical implementation guard. */
export type GuardedChangeOperation = 'draft' | 'discard'

/**
 * Thrown when a draft or discard operation is blocked because the change
 * has previously reached the `implementing` lifecycle state.
 *
 * Implementation may already exist, so shelving or abandoning the workflow
 * would risk leaving permanent specs and code out of sync. Pass `--force`
 * to bypass this guard intentionally.
 */
export class HistoricalImplementationGuardError extends SpecdError {
  private readonly _operation: GuardedChangeOperation
  private readonly _changeName: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'IMPLEMENTATION_DETECTED'
  }

  /** The operation that was blocked (`'draft'` or `'discard'`). */
  get operation(): GuardedChangeOperation {
    return this._operation
  }

  /** The name of the change that triggered the guard. */
  get changeName(): string {
    return this._changeName
  }

  /**
   * Creates a new `HistoricalImplementationGuardError`.
   *
   * @param operation - The operation that was blocked
   * @param changeName - The name of the change that triggered the guard
   */
  constructor(operation: GuardedChangeOperation, changeName: string) {
    super(
      `Cannot ${operation} a change that has reached implementing without --force: implementation may already exist and specs and code could be left out of sync`,
    )
    this._operation = operation
    this._changeName = changeName
  }
}
