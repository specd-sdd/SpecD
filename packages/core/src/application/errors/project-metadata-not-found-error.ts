import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when project-metadata.json is missing but required.
 */
export class ProjectMetadataNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'PROJECT_METADATA_NOT_FOUND'
  }

  /**
   * Creates a new `ProjectMetadataNotFoundError` instance.
   */
  constructor() {
    super('Project metadata not found')
  }
}
