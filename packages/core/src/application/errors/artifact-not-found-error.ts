import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a referenced artifact does not exist on a change.
 */
export class ArtifactNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARTIFACT_NOT_FOUND'
  }

  /**
   * Creates a new `ArtifactNotFoundError` instance.
   *
   * @param artifactId - The artifact type ID that was not found
   * @param changeName - The change name
   */
  constructor(artifactId: string, changeName: string) {
    super(`Artifact '${artifactId}' not found on change '${changeName}'`)
  }
}
