import { SpecdError } from './specd-error.js'

/**
 * Thrown when `markSkipped()` is called on a required (non-optional) artifact.
 *
 * Only artifacts declared as `optional: true` in the schema may be skipped.
 * Attempting to skip a required artifact is a programming error in the calling
 * use case and should be caught before reaching the domain.
 */
export class ArtifactNotOptionalError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARTIFACT_NOT_OPTIONAL'
  }

  /**
   * Creates a new `ArtifactNotOptionalError` for the given artifact type.
   *
   * @param type - The artifact type ID that was incorrectly marked as skipped
   */
  constructor(type: string) {
    super(`Artifact "${type}" is required — only optional artifacts may be skipped`)
  }
}
