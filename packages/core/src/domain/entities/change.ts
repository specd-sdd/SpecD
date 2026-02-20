import { type ChangeState, isValidTransition } from '../value-objects/change-state.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { SpecPath } from '../value-objects/spec-path.js'
import { InvalidStateTransitionError } from '../errors/invalid-state-transition-error.js'
import { ApprovalRequiredError } from '../errors/approval-required-error.js'
import { type Artifact } from './artifact.js'

/**
 * Describes a single structural change detected in a spec during delta validation.
 */
export interface StructuralChange {
  /** The spec path where the structural change occurred. */
  readonly spec: string
  /** Whether the block was modified or removed (both are structural operations). */
  readonly type: 'MODIFIED' | 'REMOVED'
  /** The block name (requirement, scenario, etc.) that was structurally changed. */
  readonly requirement: string
}

/**
 * Records that a change has been approved, capturing who approved it,
 * when, and which structural spec changes were reviewed.
 */
export interface ApprovalRecord {
  /** Free-text rationale for the approval. */
  readonly reason: string
  /** Git identity (name + email) of the approver. */
  readonly approvedBy: string
  /** Timestamp when approval was recorded. */
  readonly approvedAt: Date
  /** The structural spec modifications that were explicitly reviewed and approved. */
  readonly structuralChanges: readonly StructuralChange[]
}

/**
 * Construction properties for a `Change`.
 */
export interface ChangeProps {
  /** Unique name identifying the change. */
  name: string
  /** The spec path scope this change operates within. */
  scope: SpecPath
  /** Initial lifecycle state. Defaults to `"drafting"`. */
  state?: ChangeState
  /** Pre-loaded artifact map. Defaults to an empty map. */
  artifacts?: Map<string, Artifact>
  /** Pre-loaded approval record. */
  approval?: ApprovalRecord
  /** Creation timestamp. Defaults to `new Date()`. */
  createdAt?: Date
}

/**
 * The central domain entity representing an in-progress spec change.
 *
 * A `Change` moves through a lifecycle (`ChangeState`) from `drafting` to
 * `archivable`. It owns a set of `Artifact` files that must be validated
 * before archiving. If the change touches structural spec sections (MODIFIED
 * or REMOVED operations), it must be approved before it can be archived.
 */
export class Change {
  private readonly _name: string
  private readonly _scope: SpecPath
  private readonly _createdAt: Date
  private _state: ChangeState
  private _artifacts: Map<string, Artifact>
  private _approval: ApprovalRecord | undefined

  /**
   * Creates a new `Change` from the given properties.
   *
   * @param props - Change construction properties
   */
  constructor(props: ChangeProps) {
    this._name = props.name
    this._scope = props.scope
    this._createdAt = props.createdAt ?? new Date()
    this._state = props.state ?? 'drafting'
    this._artifacts = props.artifacts ?? new Map<string, Artifact>()
    this._approval = props.approval
  }

  /** Unique name identifying this change. */
  get name(): string {
    return this._name
  }

  /** The spec path scope this change operates within. */
  get scope(): SpecPath {
    return this._scope
  }

  /** Timestamp when the change was created. */
  get createdAt(): Date {
    return this._createdAt
  }

  /** The current lifecycle state of this change. */
  get state(): ChangeState {
    return this._state
  }

  /** All artifacts currently attached to this change, keyed by type. */
  get artifacts(): ReadonlyMap<string, Artifact> {
    return this._artifacts
  }

  /** The approval record, or `undefined` if not yet approved. */
  get approval(): ApprovalRecord | undefined {
    return this._approval
  }

  /**
   * Returns whether this change is ready to be archived (`state === "archivable"`).
   */
  get isArchivable(): boolean {
    return this._state === 'archivable'
  }

  /**
   * Computes the effective artifact status for `type`, cascading through
   * the dependency graph to reflect blocking dependencies.
   *
   * If any required artifact is not `complete`, this artifact's effective
   * status is `in-progress` even if the artifact itself is `complete`.
   *
   * @param type - The artifact type ID to evaluate
   * @returns The effective `ArtifactStatus` after dependency resolution
   */
  effectiveStatus(type: string): ArtifactStatus {
    const artifact = this._artifacts.get(type)
    if (!artifact) return 'missing'
    if (artifact.status === 'missing') return 'missing'

    for (const req of artifact.requires) {
      if (this.effectiveStatus(req) !== 'complete') return 'in-progress'
    }

    return artifact.status
  }

  /**
   * Attempts a lifecycle state transition.
   *
   * @param to - The target state
   * @throws {InvalidStateTransitionError} If the transition is not permitted
   */
  transition(to: ChangeState): void {
    if (!isValidTransition(this._state, to)) {
      throw new InvalidStateTransitionError(this._state, to)
    }
    this._state = to
  }

  /**
   * Records an approval for this change, transitioning its state to `"approved"`.
   *
   * May only be called when the change is in `"pending-approval"` state.
   *
   * @param reason - Free-text rationale for the approval
   * @param approvedBy - Git identity of the approver (name + email)
   * @param structuralChanges - The structural spec modifications being approved
   * @throws {InvalidStateTransitionError} If the change is not in `"pending-approval"` state
   */
  approve(
    reason: string,
    approvedBy: string,
    structuralChanges: readonly StructuralChange[],
  ): void {
    if (this._state !== 'pending-approval') {
      throw new InvalidStateTransitionError(this._state, 'approved')
    }
    this._approval = {
      reason,
      approvedBy,
      approvedAt: new Date(),
      structuralChanges,
    }
    this._state = 'approved'
  }

  /**
   * Asserts that this change is in a state that permits archiving.
   *
   * @throws {ApprovalRequiredError} If the change is in `"pending-approval"` state
   * @throws {InvalidStateTransitionError} If the change is not in `"archivable"` state
   */
  assertArchivable(): void {
    if (this._state === 'pending-approval') {
      throw new ApprovalRequiredError(this._name)
    }
    if (!this.isArchivable) {
      throw new InvalidStateTransitionError(this._state, 'archivable')
    }
  }

  /**
   * Adds or replaces an artifact on this change, keyed by its type.
   *
   * @param artifact - The artifact to attach
   */
  setArtifact(artifact: Artifact): void {
    this._artifacts.set(artifact.type, artifact)
  }

  /**
   * Returns the artifact of the given type, or `null` if not present.
   *
   * @param type - The artifact type ID to look up
   * @returns The artifact, or `null` if not found
   */
  getArtifact(type: string): Artifact | null {
    return this._artifacts.get(type) ?? null
  }
}
