import { SpecdError } from './specd-error.js'

/**
 * Thrown when a resolved directory path required by specd does not exist on disk.
 */
export class StorageDirectoryNotFoundError extends SpecdError {
  private readonly _path: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'STORAGE_DIRECTORY_NOT_FOUND_ERROR'
  }

  /** The physical path that was not found. */
  get path(): string {
    return this._path
  }

  /**
   * Creates a new `StorageDirectoryNotFoundError`.
   *
   * @param path - The path to the directory that was not found
   * @param reason - Human-readable description of the missing directory's role
   */
  constructor(path: string, reason: string) {
    super(`Storage directory not found at '${path}': ${reason}`)
    this._path = path
  }
}
