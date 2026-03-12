import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a requested workspace does not exist in the configuration.
 */
export class WorkspaceNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'WORKSPACE_NOT_FOUND'
  }

  /**
   * Creates a new `WorkspaceNotFoundError` instance.
   *
   * @param name - The workspace name that was not found
   */
  constructor(name: string) {
    super(`Workspace '${name}' not found`)
  }
}
