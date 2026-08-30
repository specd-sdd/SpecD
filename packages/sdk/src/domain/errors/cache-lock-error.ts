import { SpecdError } from '@specd/core'

/**
 * Thrown when a suggestion cache flush cannot acquire the exclusive file lock
 * within the allowed timeout — typically because another process is writing
 * the same cache file concurrently.
 */
export class CacheLockError extends SpecdError {
  /** @internal stored lock path */
  private readonly _lockPath: string

  /**
   * Machine-readable error code used for programmatic handling.
   * @returns The error code string
   */
  override get code(): string {
    return 'CACHE_LOCKED'
  }

  /**
   * The path of the lock file that could not be acquired.
   * @returns Absolute path to the lock file
   */
  get lockPath(): string {
    return this._lockPath
  }

  /**
   * Creates a new `CacheLockError`.
   *
   * @param lockPath - Absolute path to the lock file
   * @param timeoutMs - Optional maximum time (ms) that was waited for the lock
   */
  constructor(lockPath: string, timeoutMs?: number) {
    super(
      timeoutMs !== undefined
        ? `The suggestion cache is currently in use by another process. ` +
            `Timed out after ${timeoutMs} ms; please wait for the other process to finish and try again.`
        : 'The suggestion cache is currently in use by another process. ' +
            'Please wait for the other process to finish and try again.',
    )
    this._lockPath = lockPath
  }
}
