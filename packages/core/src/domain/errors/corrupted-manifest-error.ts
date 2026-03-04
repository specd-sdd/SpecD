import { SpecdError } from './specd-error.js'

/**
 * Thrown when a change manifest is corrupted — missing required events,
 * containing invalid state values, or failing schema validation.
 */
export class CorruptedManifestError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CORRUPTED_MANIFEST'
  }

  /**
   * Creates a new `CorruptedManifestError`.
   *
   * @param context - A string describing the corruption context (e.g. change name or directory path)
   */
  constructor(context: string) {
    super(`Corrupted manifest: ${context}`)
  }
}
