import { SpecdError } from './specd-error.js'

/**
 * Thrown when a change manifest is missing its required `created` event,
 * indicating the manifest file is corrupted or was manually edited incorrectly.
 */
export class CorruptedManifestError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CORRUPTED_MANIFEST'
  }

  /**
   * Creates a new `CorruptedManifestError`.
   *
   * @param changeName - The name of the change whose manifest is corrupted
   */
  constructor(changeName: string) {
    super(
      `Change '${changeName}' has no 'created' event in its history — this is a corrupted manifest`,
    )
  }
}
