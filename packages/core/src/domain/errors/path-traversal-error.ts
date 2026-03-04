import { SpecdError } from './specd-error.js'

/**
 * Thrown when a file read is attempted outside the configured base directory,
 * indicating a path-traversal attack or misconfiguration.
 */
export class PathTraversalError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'PATH_TRAVERSAL'
  }

  /**
   * Creates a new `PathTraversalError`.
   *
   * @param resolvedPath - The absolute path that was found to escape the base directory
   */
  constructor(resolvedPath: string) {
    super(`Path traversal detected: "${resolvedPath}" resolves outside the allowed base directory`)
  }
}
