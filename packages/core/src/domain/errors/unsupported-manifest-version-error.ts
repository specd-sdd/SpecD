import { SpecdError } from './specd-error.js'

/**
 * Thrown when a change manifest has a manifestVersion higher than the maximum
 * supported version by the current specd release, or has an invalid version format.
 */
export class UnsupportedManifestVersionError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'UNSUPPORTED_MANIFEST_VERSION'
  }

  private readonly _version: unknown

  /**
   * Creates the error.
   *
   * @param version - Manifest version that could not be loaded
   */
  constructor(version: unknown) {
    super(`Unsupported manifest version: ${String(version)}`)
    this._version = version
  }

  /** Manifest version that could not be loaded. */
  get version(): unknown {
    return this._version
  }
}
