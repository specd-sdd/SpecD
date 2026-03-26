import { type ChangeState } from './change-state.js'

/**
 * A change participating in a spec overlap.
 */
export interface OverlapChange {
  /** The change name. */
  readonly name: string
  /** The change's current lifecycle state. */
  readonly state: ChangeState
}

/**
 * A single spec targeted by multiple active changes.
 *
 * Immutable value object — once created, its fields cannot be modified.
 */
export class OverlapEntry {
  private readonly _specId: string
  private readonly _changes: readonly OverlapChange[]

  /**
   * Creates a new `OverlapEntry`.
   *
   * @param specId - The qualified spec ID targeted by multiple changes
   * @param changes - The changes targeting this spec
   */
  constructor(specId: string, changes: readonly OverlapChange[]) {
    this._specId = specId
    this._changes = [...changes]
  }

  /** The qualified spec ID (e.g. `core:core/config`). */
  get specId(): string {
    return this._specId
  }

  /** The changes targeting this spec, sorted by name. */
  get changes(): readonly OverlapChange[] {
    return this._changes
  }
}
