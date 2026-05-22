import { SpecdError } from './specd-error.js'

/**
 * Thrown when the dependencies extracted during archive preflight mismatch
 * the dependencies persisted in the change metadata.
 *
 * This indicates that the code has changed since the dependencies were last
 * analyzed, or that the analysis itself is inconsistent. The user should
 * re-verify or re-extract dependencies before proceeding with the archive.
 */
export class ArchiveDependencyMismatchError extends SpecdError {
  private readonly _specId: string
  private readonly _expectedDeps: string[]
  private readonly _actualDeps: string[]

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARCHIVE_DEPENDENCY_MISMATCH'
  }

  /**
   * The spec whose persisted and extracted dependencies disagree.
   */
  get specId(): string {
    return this._specId
  }

  /**
   * The dependencies that were expected based on change metadata.
   */
  get expectedDeps(): string[] {
    return this._expectedDeps
  }

  /**
   * The dependencies that were actually extracted from the implementation.
   */
  get actualDeps(): string[] {
    return this._actualDeps
  }

  /**
   * Creates a new `ArchiveDependencyMismatchError`.
   *
   * @param specId - The spec whose dependencies mismatched
   * @param expectedDeps - The dependencies recorded in the metadata
   * @param actualDeps - The dependencies extracted from the code
   */
  constructor(specId: string, expectedDeps: string[], actualDeps: string[]) {
    super(
      `Archive failed for '${specId}': extracted dependencies [${actualDeps.join(', ')}] do not match persisted dependencies [${expectedDeps.join(', ')}]. Re-run dependency extraction or update the change dependencies.`,
    )
    this._specId = specId
    this._expectedDeps = expectedDeps
    this._actualDeps = actualDeps
  }
}
