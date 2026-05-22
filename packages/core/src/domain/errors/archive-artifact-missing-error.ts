import { SpecdError } from './specd-error.js'

/**
 * Thrown when a required artifact (spec, delta, or metadata) is missing
 * during the archive process.
 *
 * This typically happens if files were manually deleted from the .specd directory
 * or if the change state has become corrupted.
 */
export class ArchiveArtifactMissingError extends SpecdError {
  private readonly _artifactPath: string
  private readonly _artifactType: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARCHIVE_ARTIFACT_MISSING'
  }

  /**
   * The path to the missing artifact.
   */
  get artifactPath(): string {
    return this._artifactPath
  }

  /**
   * The type of the missing artifact (e.g., 'spec', 'delta', 'metadata').
   */
  get artifactType(): string {
    return this._artifactType
  }

  /**
   * Creates a new `ArchiveArtifactMissingError`.
   *
   * @param artifactPath - The expected path of the missing file
   * @param artifactType - The role of the missing file in the archive
   */
  constructor(artifactPath: string, artifactType: string) {
    super(`Archive failed: required ${artifactType} artifact missing at "${artifactPath}"`)
    this._artifactPath = artifactPath
    this._artifactType = artifactType
  }
}
