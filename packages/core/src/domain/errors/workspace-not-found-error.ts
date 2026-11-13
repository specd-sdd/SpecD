import { SpecdError } from './specd-error.js'

/**
 * Optional context that enriches a workspace-not-found message.
 */
export interface WorkspaceNotFoundContext {
  /** Spec ID that referenced the missing workspace, when known. */
  readonly specId?: string
  /** Configured workspace names, when known. */
  readonly known?: readonly string[]
}

/**
 * Thrown when a requested workspace does not exist in the configuration.
 */
export class WorkspaceNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'WORKSPACE_NOT_FOUND'
  }

  /**
   * Creates a new `WorkspaceNotFoundError`.
   *
   * @param name - The workspace name that was not found
   * @param context - Optional spec ID and known workspace names for the message
   */
  constructor(name: string, context: WorkspaceNotFoundContext = {}) {
    const where = context.specId !== undefined ? ` in spec ID '${context.specId}'` : ''
    const known =
      context.known !== undefined ? ` (known workspaces: ${context.known.join(', ')})` : ''
    super(`Workspace '${name}' not found${where}${known}`)
  }
}
