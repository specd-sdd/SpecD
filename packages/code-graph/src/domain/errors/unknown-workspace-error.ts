import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a `workspace:path` input names a workspace that is not configured.
 */
export class UnknownWorkspaceError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code `UNKNOWN_WORKSPACE`.
   */
  get code(): string {
    return 'UNKNOWN_WORKSPACE'
  }

  /**
   * Creates a new UnknownWorkspaceError.
   * @param workspace - The unknown workspace name.
   * @param input - The path input that referenced it.
   */
  constructor(workspace: string, input: string) {
    super(`Unknown workspace '${workspace}' in path '${input}'`)
  }
}
