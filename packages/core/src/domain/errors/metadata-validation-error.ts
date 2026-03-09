import { SpecdError } from './specd-error.js'

/**
 * Thrown when `.specd-metadata.yaml` content fails structural validation
 * during a write operation ({@link SaveSpecMetadata}).
 *
 * Read-path parsing ({@link parseMetadata}) remains lenient and never throws.
 */
export class MetadataValidationError extends SpecdError {
  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'METADATA_VALIDATION_ERROR'
  }

  /**
   * Creates a new `MetadataValidationError`.
   *
   * @param reason - Human-readable description of the validation failures
   */
  constructor(reason: string) {
    super(`Metadata validation failed: ${reason}`)
  }
}
