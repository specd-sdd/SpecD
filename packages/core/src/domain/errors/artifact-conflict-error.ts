import { SpecdError } from './specd-error.js'

/**
 * Thrown when a repository detects that an artifact file was modified on disk
 * between the time it was loaded and the time a save was attempted.
 *
 * This indicates a concurrent write — typically an LLM agent or another process
 * wrote to the file after the caller loaded it. The caller should present the
 * conflict to the user (e.g. via a diff of `incomingContent` vs `currentContent`)
 * and offer the option to force-save or abort.
 *
 * To force-save despite the conflict, retry the call with `{ force: true }`.
 */
export class ArtifactConflictError extends SpecdError {
  private readonly _filename: string
  private readonly _incomingContent: string
  private readonly _currentContent: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARTIFACT_CONFLICT'
  }

  /**
   * The filename of the artifact where the conflict was detected.
   */
  get filename(): string {
    return this._filename
  }

  /**
   * The content the caller is trying to write.
   * Use together with `currentContent` to produce a diff for the user.
   */
  get incomingContent(): string {
    return this._incomingContent
  }

  /**
   * The content currently on disk at the time the conflict was detected.
   * Use together with `incomingContent` to produce a diff for the user.
   */
  get currentContent(): string {
    return this._currentContent
  }

  /**
   * Creates a new `ArtifactConflictError` with the conflicting contents for diff display.
   *
   * @param filename - The artifact filename where the conflict was detected
   * @param incomingContent - The content the caller is trying to write
   * @param currentContent - The content currently on disk
   */
  constructor(filename: string, incomingContent: string, currentContent: string) {
    super(
      `Artifact "${filename}" was modified after it was loaded — save aborted to prevent data loss`,
    )
    this._filename = filename
    this._incomingContent = incomingContent
    this._currentContent = currentContent
  }
}
