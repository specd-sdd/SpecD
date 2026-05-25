import { SpecdError } from './specd-error.js'

/** Thrown when batch restore completes with one or more failed spec directories. */
export class ArchiveBatchRestoreError extends SpecdError {
  private readonly _restoredSpecIds: readonly string[]
  private readonly _failedSpecIds: readonly string[]

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ARCHIVE_BATCH_RESTORE_FAILED'
  }

  /** Spec IDs restored successfully. */
  get restoredSpecIds(): readonly string[] {
    return this._restoredSpecIds
  }

  /** Spec IDs that could not be restored. */
  get failedSpecIds(): readonly string[] {
    return this._failedSpecIds
  }

  /**
   * Creates a new `ArchiveBatchRestoreError`.
   *
   * @param restoredSpecIds - Spec IDs restored successfully
   * @param failedSpecIds - Spec IDs that failed restore
   */
  constructor(restoredSpecIds: readonly string[], failedSpecIds: readonly string[]) {
    const message =
      failedSpecIds.length === 0
        ? 'Archive batch restore failed'
        : `Archive batch restore incomplete — failed specs: ${failedSpecIds.join(', ')}`
    super(message)
    this._restoredSpecIds = restoredSpecIds
    this._failedSpecIds = failedSpecIds
  }
}
