import { SpecdError } from './specd-error.js'

/** Thrown when an implementation file resolves outside the workspace codeRoot. */
export class ImplementationWorkspaceBoundaryError extends SpecdError {
  /**
   * Creates a new ImplementationWorkspaceBoundaryError.
   * @param file - The implementation file path.
   * @param workspace - The workspace whose codeRoot was violated.
   */
  constructor(
    readonly file: string,
    readonly workspace: string,
  ) {
    super(`Implementation file "${file}" resolves outside workspace "${workspace}"'s codeRoot`)
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'IMPLEMENTATION_WORKSPACE_BOUNDARY'
  }
}
