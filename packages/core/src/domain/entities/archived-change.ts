import { SpecPath } from '../value-objects/spec-path.js'

/**
 * Construction properties for an `ArchivedChange`.
 */
export interface ArchivedChangeProps {
  /** The original change name. */
  name: string
  /** The name used for the archive directory (may differ from `name`). */
  archivedName: string
  /** The workspace under which the change's specs lived. */
  workspace: SpecPath
  /** Timestamp when the change was archived. */
  archivedAt: Date
  /** Artifact type IDs that were present when the change was archived. */
  artifacts: readonly string[]
}

/**
 * An immutable historical record of a change that has been archived.
 *
 * Created during the archive operation and stored in the archive index.
 * Once created, an `ArchivedChange` is never mutated.
 */
export class ArchivedChange {
  private readonly _name: string
  private readonly _archivedName: string
  private readonly _workspace: SpecPath
  private readonly _archivedAt: Date
  private readonly _artifacts: readonly string[]

  /**
   * Creates a new `ArchivedChange` from the given properties.
   *
   * @param props - ArchivedChange construction properties
   */
  constructor(props: ArchivedChangeProps) {
    this._name = props.name
    this._archivedName = props.archivedName
    this._workspace = props.workspace
    this._archivedAt = props.archivedAt
    this._artifacts = props.artifacts
  }

  /** The original change name. */
  get name(): string {
    return this._name
  }

  /** The name used for the archive directory. */
  get archivedName(): string {
    return this._archivedName
  }

  /** The workspace under which the change's specs lived. */
  get workspace(): SpecPath {
    return this._workspace
  }

  /** Timestamp when the change was archived. */
  get archivedAt(): Date {
    return this._archivedAt
  }

  /** Artifact type IDs that were present when the change was archived. */
  get artifacts(): readonly string[] {
    return this._artifacts
  }
}
