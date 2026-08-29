import { SpecdError } from '@specd/core'

/**
 * Thrown when a suggestion cache flush cannot acquire the exclusive file lock
 * within the allowed timeout — typically because another process is writing
 * the same cache file concurrently.
 */
export class CacheLockError extends SpecdError {
  /** The path of the lock file that could not be acquired. */
  readonly lockPath: string

  /**
   * Machine-readable error code used for programmatic handling.
   * @returns The error code string
   */
  override get code(): string {
    return 'CACHE_LOCKED'
  }

  /**
   * Creates a new `CacheLockError`.
   *
   * @param lockPath - Absolute path to the lock file
   * @param timeoutMs - The timeout that elapsed before giving up
   */
  constructor(lockPath: string, timeoutMs?: number) {
    super(
      'The suggestion cache is currently in use by another process. ' +
        'Please wait for the other process to finish and try again.',
    )
    this.lockPath = lockPath
  }
}
