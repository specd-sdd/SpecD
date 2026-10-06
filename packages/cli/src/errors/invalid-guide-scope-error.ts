import { SpecdCliError } from './specd-cli-error.js'

/**
 * Thrown when `--scope` receives a value that is neither a catalog collection nor a
 * reserved listing scope.
 *
 * The valid set is derived from the catalog rather than hardcoded, so a scope naming
 * a collection that the active catalog does not serve fails loudly instead of
 * silently returning an empty listing.
 */
export class InvalidGuideScopeError extends SpecdCliError {
  /**
   * Returns the machine-readable error code.
   *
   * @returns 'INVALID_GUIDE_SCOPE'
   */
  get code(): string {
    return 'INVALID_GUIDE_SCOPE'
  }

  /**
   * Creates a new `InvalidGuideScopeError`.
   *
   * @param message - Validation failure details
   */
  constructor(message: string) {
    super(message)
  }
}
