import { SpecdError } from './specd-error.js'

/**
 * Thrown when the state of implementation files prevents an archive.
 *
 * This occurs if implementation files are out-of-scope for the change,
 * have uncommitted changes that aren't tracked by deltas, or are in an
 * inconsistent state for final archiving.
 */
export class ArchiveImplementationStateError extends SpecdError {
  private readonly _filePaths: string[]
  private readonly _reason: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARCHIVE_IMPLEMENTATION_STATE'
  }

  /**
   * The paths of the files causing the state error.
   */
  get filePaths(): string[] {
    return this._filePaths
  }

  /**
   * The specific reason why the implementation state is invalid.
   */
  get reason(): string {
    return this._reason
  }

  /**
   * Creates a new `ArchiveImplementationStateError`.
   *
   * @param filePaths - The files with state issues
   * @param reason - Descriptive reason for the failure
   */
  constructor(filePaths: string[], reason: string) {
    super(`Archive failed: implementation state invalid. ${reason}`)
    this._filePaths = filePaths
    this._reason = reason
  }
}
