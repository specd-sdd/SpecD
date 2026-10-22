import { SpecdError } from './specd-error.js'
import { type OverlapEntry } from '../value-objects/overlap-entry.js'

/**
 * Thrown when `ArchiveChange` detects that other active changes target the
 * same specs as the change being archived, and `spec.overlap` is not bypassed.
 *
 * Carries the overlap entries so the caller can display which specs and
 * changes are involved, and whether the resolved `spec.overlap` binding can be
 * bypassed (`skippable`). The message is delivery-agnostic: hosts compose their
 * own bypass hint from `skippable`, so they only suggest a bypass that will be
 * accepted.
 */
export class SpecOverlapError extends SpecdError {
  private readonly _entries: readonly OverlapEntry[]
  private readonly _skippable: boolean

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'SPEC_OVERLAP'
  }

  /**
   * Creates a new `SpecOverlapError`.
   *
   * @param entries - The overlap entries describing which specs and changes overlap
   * @param options - Optional error options
   * @param options.skippable - Whether the resolved `spec.overlap` binding can be bypassed; defaults to `true`
   */
  constructor(entries: readonly OverlapEntry[], options: { readonly skippable?: boolean } = {}) {
    const skippable = options.skippable ?? true
    const specList = entries
      .map((e) => `${e.specId} (${e.changes.map((peer) => peer.name).join(', ')})`)
      .join(', ')
    super(`Cannot archive: specs [${specList}] are also targeted by other active changes.`)
    this._entries = entries
    this._skippable = skippable
  }

  /**
   * The overlap entries describing which specs and changes are involved.
   *
   * @returns Overlap entries with spec IDs and change names
   */
  get entries(): readonly OverlapEntry[] {
    return this._entries
  }

  /**
   * Whether the resolved `spec.overlap` binding can be bypassed.
   *
   * @returns True when a bypass suggestion is valid
   */
  get skippable(): boolean {
    return this._skippable
  }
}
