import { SpecPath } from '../value-objects/spec-path.js'
import { type GitIdentity } from './change.js'

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
  /** Git identity of the actor who archived the change, if recorded. */
  archivedBy?: GitIdentity
  /** Artifact type IDs that were present when the change was archived. */
  artifacts: readonly string[]
  /** Spec paths that were associated with the change at archive time. */
  specIds: readonly string[]
  /** Name of the schema that governed the change. */
  schemaName: string
  /** Version of the schema that governed the change. */
  schemaVersion: number
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
  private readonly _archivedBy: GitIdentity | undefined
  private readonly _artifacts: readonly string[]
  private readonly _specIds: readonly string[]
  private readonly _schemaName: string
  private readonly _schemaVersion: number

  /**
   * Creates a new `ArchivedChange` from the given properties.
   *
   * @param props - ArchivedChange construction properties
   */
  constructor(props: ArchivedChangeProps) {
    this._name = props.name
    this._archivedName = props.archivedName
    this._workspace = props.workspace
    this._archivedAt = new Date(props.archivedAt.getTime())
    this._archivedBy = props.archivedBy
    this._artifacts = props.artifacts
    this._specIds = props.specIds
    this._schemaName = props.schemaName
    this._schemaVersion = props.schemaVersion
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
    return new Date(this._archivedAt.getTime())
  }

  /** Git identity of the actor who archived the change, or `undefined` if not recorded. */
  get archivedBy(): GitIdentity | undefined {
    return this._archivedBy
  }

  /** Artifact type IDs that were present when the change was archived. */
  get artifacts(): readonly string[] {
    return this._artifacts
  }

  /** Spec paths that were associated with the change at archive time. */
  get specIds(): readonly string[] {
    return this._specIds
  }

  /** Name of the schema that governed the change. */
  get schemaName(): string {
    return this._schemaName
  }

  /** Version of the schema that governed the change. */
  get schemaVersion(): number {
    return this._schemaVersion
  }
}
