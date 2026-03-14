import { SpecdError } from './specd-error.js'

/**
 * Thrown when a hook ID does not match any hook in the resolved list,
 * or matches a hook of the wrong type (e.g. `instruction:` when `run:` was expected).
 */
export class HookNotFoundError extends SpecdError {
  private readonly _hookId: string
  private readonly _reason: 'not-found' | 'wrong-type'

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'HOOK_NOT_FOUND'
  }

  /**
   * Creates a new `HookNotFoundError`.
   *
   * @param hookId - The hook ID that was not found or had the wrong type
   * @param reason - Why the lookup failed
   */
  constructor(hookId: string, reason: 'not-found' | 'wrong-type') {
    const message =
      reason === 'not-found'
        ? `Hook '${hookId}' not found`
        : `Hook '${hookId}' is not a run/instruction hook`
    super(message)
    this._hookId = hookId
    this._reason = reason
  }

  /** The hook ID that failed lookup. */
  get hookId(): string {
    return this._hookId
  }

  /** Whether the hook was missing or had the wrong type. */
  get reason(): 'not-found' | 'wrong-type' {
    return this._reason
  }
}
