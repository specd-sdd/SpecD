import { SpecdError } from '../../domain/errors/specd-error.js'

/** Thrown when a filename is not tracked on the change manifest. */
export class ChangeArtifactFileNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CHANGE_ARTIFACT_FILE_NOT_FOUND'
  }

  /**
   * Creates an error for an untracked change artifact filename.
   *
   * @param filename - Requested artifact filename
   * @param changeName - Change name
   */
  constructor(filename: string, changeName: string) {
    super(`Artifact file '${filename}' is not tracked on change '${changeName}'`)
  }
}
