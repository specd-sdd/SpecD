import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a tracked implementation file cannot be ignored because
 * confirmed implementation links still reference it.
 */
export class ImplementationLinksExistError extends SpecdError {
  private readonly _file: string
  private readonly _specIds: readonly string[]

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'IMPLEMENTATION_LINKS_EXIST'
  }

  /** Raw project-relative file path that is still linked. */
  get file(): string {
    return this._file
  }

  /** Spec IDs that still reference the file. */
  get specIds(): readonly string[] {
    return this._specIds
  }

  /**
   * Creates a new `ImplementationLinksExistError`.
   *
   * @param file - Raw project-relative file path
   * @param specIds - Spec IDs that still reference the file
   */
  constructor(file: string, specIds: readonly string[]) {
    super(`Cannot ignore implementation file '${file}' while links still exist`)
    this._file = file
    this._specIds = [...specIds]
  }
}
