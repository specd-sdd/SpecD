import { SpecdError } from './specd-error.js'

/**
 * Thrown when the `'default'` workspace is missing from a `SpecdConfig`.
 *
 * Every valid `SpecdConfig` must contain exactly one workspace named `'default'`.
 * This error indicates a configuration that violates that invariant.
 */
export class MissingDefaultWorkspaceError extends SpecdError {
  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'MISSING_DEFAULT_WORKSPACE'
  }

  /** Creates a new `MissingDefaultWorkspaceError`. */
  constructor() {
    super("SpecdConfig is missing a 'default' workspace — every config must have one")
  }
}
