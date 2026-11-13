import { SpecdError } from './specd-error.js'

/**
 * Thrown when a persisted `spec-lock.json` fails structural or ID validation.
 */
export class InvalidSpecLockError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_SPEC_LOCK'
  }

  /**
   * Creates a new `InvalidSpecLockError`.
   *
   * @param specId - Fully-qualified spec ID owning the lock, when known
   * @param location - Lock file path as shown to users, when known
   * @param fieldPath - Dot-path of the failing field (empty string for invalid JSON)
   * @param reason - Description of why the field or document is invalid
   * @param rejectedValue - Invalid persisted spec ID, when the field contains one
   */
  constructor(
    readonly specId: string | undefined,
    readonly location: string | undefined,
    readonly fieldPath: string,
    readonly reason: string,
    readonly rejectedValue?: string,
  ) {
    super(
      `Invalid spec-lock${specId ? ` for '${specId}'` : ''}${location ? ` at ${location}` : ''}: ` +
        `${fieldPath ? `field '${fieldPath}' ` : ''}${rejectedValue !== undefined ? `value ${JSON.stringify(rejectedValue)} ` : ''}${reason}.`,
    )
  }
}
