import { SpecdError } from './specd-error.js'

/**
 * Thrown when an operation attempts to write to a spec or artifact in a
 * workspace whose ownership is `readOnly`.
 *
 * Callers construct the message with context appropriate to the enforcement
 * point (spec ID, workspace name, operation type).
 */
export class ReadOnlyWorkspaceError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'READ_ONLY_WORKSPACE'
  }

  /**
   * Creates a new `ReadOnlyWorkspaceError`.
   *
   * @param message - Human-readable description of the blocked operation
   */
  constructor(message: string) {
    super(message)
  }
}
