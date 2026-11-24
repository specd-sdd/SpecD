import { SpecdError } from './specd-error.js'

/**
 * Thrown when a leftover archive backup directory blocks a new archive attempt.
 *
 * Cases:
 * - Foreign backup: the manifest names a different change (`foreignChangeName` is `true`,
 *   `changeName` is the foreign change); the backup is left untouched.
 * - Recovered backup: the manifest names the current change; canonical files were restored
 *   from it and the backup removed, and the archive must be retried after review.
 * - Corrupt or unreadable manifest: the manifest is not valid or cannot be read for a reason
 *   other than absence (`foreignChangeName` is `false`, `changeName` is the current change);
 *   the backup and canonical files are left untouched.
 */
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
