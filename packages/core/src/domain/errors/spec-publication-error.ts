import { SpecdError } from './specd-error.js'

/**
 * Thrown when a spec cannot be published atomically into canonical storage.
 *
 * Carries the preserved staging path so callers and users can recover the
 * prepared output manually when final publication fails.
 */
export class SpecPublicationError extends SpecdError {
  private readonly _specId: string
  private readonly _stagingPath: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SPEC_PUBLICATION_FAILED'
  }

  /**
   * Returns the affected spec ID.
   *
   * @returns The canonical `workspace:capabilityPath` label
   */
  get specId(): string {
    return this._specId
  }

  /**
   * Returns the preserved staging path for manual recovery.
   *
   * @returns Absolute staging directory path
   */
  get stagingPath(): string {
    return this._stagingPath
  }

  /**
   * Creates a new `SpecPublicationError`.
   *
   * @param specId - The spec that failed publication
   * @param stagingPath - The preserved staging directory
   * @param causeMessage - Low-level failure description
   */
  constructor(specId: string, stagingPath: string, causeMessage: string) {
    super(
      `Failed to publish spec "${specId}" atomically. Staging remains at "${stagingPath}" for manual recovery. ${causeMessage}`,
    )
    this._specId = specId
    this._stagingPath = stagingPath
  }
}
