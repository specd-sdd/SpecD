import { SpecdError } from './specd-error.js'

/** Thrown when persisted metadata cannot be parsed from storage. */
export class SpecMetadataParseError extends SpecdError {
  /**
   * Creates a new SpecMetadataParseError.
   * @param specId - The spec whose metadata failed to parse.
   * @param cause - Human-readable parse failure details.
   */
  constructor(
    readonly specId: string,
    readonly cause: string,
  ) {
    super(`Failed to parse metadata for spec "${specId}": ${cause}`)
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'SPEC_METADATA_PARSE_ERROR'
  }
}
