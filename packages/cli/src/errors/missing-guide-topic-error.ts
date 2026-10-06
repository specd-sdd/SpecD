import { SpecdCliError } from './specd-cli-error.js'

/**
 * Thrown when a body-narrowing flag is supplied without the topic argument it applies to.
 *
 * These flags only affect a document's body, so accepting them during a catalog listing
 * would silently discard the caller's request.
 */
export class MissingGuideTopicError extends SpecdCliError {
  /**
   * Returns the machine-readable error code.
   *
   * @returns 'MISSING_GUIDE_TOPIC'
   */
  get code(): string {
    return 'MISSING_GUIDE_TOPIC'
  }

  /**
   * Creates a new `MissingGuideTopicError`.
   *
   * @param message - Validation failure details
   */
  constructor(message: string) {
    super(message)
  }
}
