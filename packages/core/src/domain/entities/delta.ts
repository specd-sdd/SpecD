import { SpecPath } from '../value-objects/spec-path.js'

/**
 * Construction properties for a `Delta`.
 */
export interface DeltaProps {
  /** The spec path this delta targets. */
  readonly specPath: SpecPath
  /** Block names added to the spec. */
  readonly added: readonly string[]
  /** Block names modified in the spec. */
  readonly modified: readonly string[]
  /** Block names removed from the spec. */
  readonly removed: readonly string[]
}

/**
 * Records the named blocks changed within a single spec by a change.
 *
 * A delta is structural if it contains MODIFIED or REMOVED operations,
 * which may affect downstream consumers of the spec and therefore require
 * explicit approval before the change is archived.
 */
export class Delta {
  private readonly _specPath: SpecPath
  private readonly _added: readonly string[]
  private readonly _modified: readonly string[]
  private readonly _removed: readonly string[]

  /**
   * Creates a new `Delta` from the given properties.
   *
   * @param props - Delta construction properties
   */
  constructor(props: DeltaProps) {
    this._specPath = props.specPath
    this._added = [...props.added]
    this._modified = [...props.modified]
    this._removed = [...props.removed]
  }

  /** The spec path this delta targets. */
  get specPath(): SpecPath {
    return this._specPath
  }

  /** Block names added to the spec. */
  get added(): readonly string[] {
    return this._added
  }

  /** Block names modified in the spec. */
  get modified(): readonly string[] {
    return this._modified
  }

  /** Block names removed from the spec. */
  get removed(): readonly string[] {
    return this._removed
  }

  /**
   * Returns whether this delta contains structural changes (MODIFIED or REMOVED).
   *
   * Structural changes may break downstream consumers and require approval.
   *
   * @returns `true` if the delta has any modified or removed blocks
   */
  isStructural(): boolean {
    return this._modified.length > 0 || this._removed.length > 0
  }

  /**
   * Returns whether this delta has no operations at all.
   *
   * @returns `true` if added, modified, and removed are all empty
   */
  isEmpty(): boolean {
    return this._added.length === 0 && this._modified.length === 0 && this._removed.length === 0
  }
}
