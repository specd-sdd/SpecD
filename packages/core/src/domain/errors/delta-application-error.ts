import { SpecdError } from './specd-error.js'

/**
 * Thrown when a delta operation cannot be applied to an artifact AST
 * (no match, ambiguous match, or structural conflict during application).
 */
export class DeltaApplicationError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'DELTA_APPLICATION'
  }

  /**
   * Creates a new `DeltaApplicationError` instance.
   *
   * @param message - Human-readable description of the application failure
   */
  constructor(message: string) {
    super(message)
  }
}
