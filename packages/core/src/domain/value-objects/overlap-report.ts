import { type OverlapEntry } from './overlap-entry.js'

/**
 * Aggregates all spec overlap entries for a set of changes.
 *
 * Immutable value object — `hasOverlap` is a derived property.
 */
export class OverlapReport {
  private readonly _entries: readonly OverlapEntry[]

  /**
   * Creates a new `OverlapReport`.
   *
   * @param entries - Overlap entries, one per overlapping spec
   */
  constructor(entries: readonly OverlapEntry[]) {
    this._entries = entries
  }

  /** All overlap entries, sorted by spec ID. */
  get entries(): readonly OverlapEntry[] {
    return this._entries
  }

  /** Whether any overlap was detected. */
  get hasOverlap(): boolean {
    return this._entries.length > 0
  }
}
