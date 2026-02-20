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
  /** The scope under which the change's specs lived. */
  scope: SpecPath
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
  /** The original change name. */
  readonly name: string
  /** The name used for the archive directory. */
  readonly archivedName: string
  /** The scope under which the change's specs lived. */
  readonly scope: SpecPath
  /** Timestamp when the change was archived. */
  readonly archivedAt: Date
  /** Artifact type IDs that were present when the change was archived. */
  readonly artifacts: readonly string[]
  /** Approval record, or `undefined` for non-structural changes. */
  readonly approval: ApprovalRecord | undefined

  /**
   * Creates a new `ArchivedChange` from the given properties.
   *
   * @param props - ArchivedChange construction properties
   */
  constructor(props: ArchivedChangeProps) {
    this.name = props.name
    this.archivedName = props.archivedName
    this.scope = props.scope
    this.archivedAt = props.archivedAt
    this.artifacts = props.artifacts
    this.approval = props.approval
  }

  /**
   * Returns whether this archived change included structural spec modifications
   * (i.e. it went through the approval flow before archiving).
   *
   * @returns `true` if an approval record is present
   */
  get wasStructural(): boolean {
    return this.approval !== undefined
  }
}
