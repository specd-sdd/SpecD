import { SpecPath } from '../value-objects/spec-path.js'
import { type ApprovalRecord } from './change.js'

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
  /** Approval record, present only for structural changes. */
  approval?: ApprovalRecord
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
  private readonly _approval: ApprovalRecord | undefined

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
    this._approval = props.approval
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

  /** Approval record, or `undefined` for non-structural changes. */
  get approval(): ApprovalRecord | undefined {
    return this._approval
  }

  /**
   * Returns whether this archived change included structural spec modifications
   * (i.e. it went through the approval flow before archiving).
   *
   * @returns `true` if an approval record is present
   */
  get wasStructural(): boolean {
    return this._approval !== undefined
  }
}
