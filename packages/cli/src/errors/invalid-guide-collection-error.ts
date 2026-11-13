import { SpecdCliError } from './specd-cli-error.js'

/**
 * Thrown when a guide command receives a `--collection` value the active catalog does not serve.
 *
 * Collections are a separate dimension from `--scope`, so they report their own code
 * instead of being folded into `INVALID_GUIDE_SCOPE`. This lets a caller retry after
 * fixing only the flag that was wrong.
 */
export class InvalidGuideCollectionError extends SpecdCliError {
  /**
   * Returns the machine-readable error code.
   *
   * @returns 'INVALID_GUIDE_COLLECTION'
   */
  get code(): string {
    return 'INVALID_GUIDE_COLLECTION'
  }

  /**
   * Creates a new `InvalidGuideCollectionError`.
   *
   * @param message - Validation failure details
   */
  constructor(message: string) {
    super(message)
  }
}
