import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a kernel disposer entry is malformed (empty name or non-callable `dispose`).
 */
export class InvalidDisposerError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_DISPOSER'
  }

  /**
   * Creates a new `InvalidDisposerError` instance.
   *
   * @param detail - What is wrong with the disposer entry
   */
  constructor(detail: string) {
    super(`Invalid kernel disposer: ${detail}`)
  }
}
