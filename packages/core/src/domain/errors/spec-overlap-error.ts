import { SpecdError } from './specd-error.js'
import { type OverlapEntry } from '../value-objects/overlap-entry.js'

/**
 * Thrown when `ArchiveChange` detects that other active changes target the
 * same specs as the change being archived, and `allowOverlap` is not set.
 *
 * Carries the overlap entries so the caller can display which specs and
 * changes are involved.
 */
export class SpecOverlapError extends SpecdError {
  private readonly _entries: readonly OverlapEntry[]

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'SPEC_OVERLAP'
  }

  /**
   * Creates a new `SpecOverlapError`.
   *
   * @param entries - The overlap entries describing which specs and changes overlap
   */
  constructor(entries: readonly OverlapEntry[]) {
    const specList = entries.map((e) => e.specId).join(', ')
    super(
      `Cannot archive: specs [${specList}] are also targeted by other active changes. ` +
        'Use --allow-overlap to proceed.',
    )
    this._entries = entries
  }

  /**
   * The overlap entries describing which specs and changes are involved.
   *
   * @returns Overlap entries with spec IDs and change names
   */
  get entries(): readonly OverlapEntry[] {
    return this._entries
  }
}
