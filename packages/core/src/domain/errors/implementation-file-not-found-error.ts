import { SpecdError } from './specd-error.js'

/** Thrown when an implementation link targets a file that does not exist on disk. */
export class ImplementationFileNotFoundError extends SpecdError {
  /**
   * Creates a new ImplementationFileNotFoundError.
   * @param file - The missing implementation file path.
   */
  constructor(readonly file: string) {
    super(`Implementation file "${file}" does not exist`)
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'IMPLEMENTATION_FILE_NOT_FOUND'
  }
}
