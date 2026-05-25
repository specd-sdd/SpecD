import { SpecdError } from './specd-error.js'

/** Thrown when a leftover archive backup directory blocks a new archive attempt. */
export class ArchiveOrphanBackupError extends SpecdError {
  private readonly _specId: string
  private readonly _changeName: string
  private readonly _foreignChangeName: boolean

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARCHIVE_ORPHAN_BACKUP'
  }

  /** Spec ID where the orphan backup was found. */
  get specId(): string {
    return this._specId
  }

  /** Change name recorded in the orphan manifest. */
  get changeName(): string {
    return this._changeName
  }

  /** Whether the orphan belongs to a different change. */
  get foreignChangeName(): boolean {
    return this._foreignChangeName
  }

  /**
   * Creates a new `ArchiveOrphanBackupError`.
   *
   * @param specId - Spec that contains the orphan backup
   * @param changeName - Change name from the orphan manifest
   * @param foreignChangeName - Whether the manifest change name differs from the current attempt
   * @param message - Human-readable repair guidance
   */
  constructor(specId: string, changeName: string, foreignChangeName: boolean, message: string) {
    super(message)
    this._specId = specId
    this._changeName = changeName
    this._foreignChangeName = foreignChangeName
  }
}
