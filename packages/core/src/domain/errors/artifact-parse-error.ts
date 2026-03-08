import { SpecdError } from './specd-error.js'

/**
 * Thrown when an artifact file cannot be parsed due to malformed content.
 *
 * Wraps low-level parse errors (e.g. `JSON.parse`, YAML `parseDocument`)
 * into a typed `SpecdError` subclass for programmatic handling.
 */
export class ArtifactParseError extends SpecdError {
  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'ARTIFACT_PARSE_ERROR'
  }

  /**
   * Creates a new `ArtifactParseError`.
   *
   * @param format - The artifact format that failed to parse (e.g. `'json'`, `'yaml'`)
   * @param reason - Human-readable description of the parse failure
   */
  constructor(format: string, reason: string) {
    super(`Failed to parse ${format} artifact: ${reason}`)
  }
}
