import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when an implementation link is attempted for a file that does not exist on disk.
 */
export class ImplementationFileNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'IMPLEMENTATION_FILE_NOT_FOUND'
  }

  /**
   * Creates a new `ImplementationFileNotFoundError` instance.
   *
   * @param path - The raw project-relative path that was not found
   */
  constructor(path: string) {
    super(`Implementation file not found at: ${path}`)
  }
}
