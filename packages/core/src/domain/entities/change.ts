import { type ChangeState, isValidTransition } from '../value-objects/change-state.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { InvalidStateTransitionError } from '../errors/invalid-state-transition-error.js'
import { CorruptedManifestError } from '../errors/corrupted-manifest-error.js'
import { type ChangeArtifact } from './change-artifact.js'

/** Git identity of the actor performing an operation. */
export interface GitIdentity {
  readonly name: string
  readonly email: string
}

/** Appended once when the change is first created. */
export interface CreatedEvent {
  readonly type: 'created'
  readonly at: Date
  readonly by: GitIdentity
  readonly workspaces: readonly string[]
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
}

/** Appended on each lifecycle state transition. */
export interface TransitionedEvent {
  readonly type: 'transitioned'
  readonly at: Date
  readonly by: GitIdentity
  readonly from: ChangeState
  readonly to: ChangeState
}

/** Appended when the spec approval gate is passed. */
export interface SpecApprovedEvent {
  readonly type: 'spec-approved'
  readonly at: Date
  readonly by: GitIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
}

/** Appended when the signoff gate is passed. */
export interface SignedOffEvent {
  readonly type: 'signed-off'
  readonly at: Date
  readonly by: GitIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
}

/** Appended when workspaces, specIds, or artifact content changes, superseding approvals. */
export interface InvalidatedEvent {
  readonly type: 'invalidated'
  readonly at: Date
  readonly by: GitIdentity
  readonly cause: 'workspace-change' | 'spec-change' | 'artifact-change'
}

/** Appended when the change is shelved to `drafts/`. */
export interface DraftedEvent {
  readonly type: 'drafted'
  readonly at: Date
  readonly by: GitIdentity
  readonly reason?: string
}

/** Appended when a drafted change is moved back to `changes/`. */
export interface RestoredEvent {
  readonly type: 'restored'
  readonly at: Date
  readonly by: GitIdentity
}

/** Appended when a change is permanently abandoned. */
export interface DiscardedEvent {
  readonly type: 'discarded'
  readonly at: Date
  readonly by: GitIdentity
  readonly reason: string
  readonly supersededBy?: readonly string[]
}

/** Appended when an optional artifact is explicitly skipped. */
export interface ArtifactSkippedEvent {
  readonly type: 'artifact-skipped'
  readonly at: Date
  readonly by: GitIdentity
  readonly artifactId: string
  readonly reason?: string
}

/** Discriminated union of all change history event types. */
export type ChangeEvent =
  | CreatedEvent
  | TransitionedEvent
  | SpecApprovedEvent
  | SignedOffEvent
  | InvalidatedEvent
  | DraftedEvent
  | RestoredEvent
  | DiscardedEvent
  | ArtifactSkippedEvent

/**
 * Construction properties for a `Change`.
 *
 * Mirrors the top-level fields of `manifest.json`. Repositories construct
 * a `Change` from a persisted manifest; application use cases create a new
 * `Change` by supplying an initial `history` containing a `created` event.
 */
export interface ChangeProps {
  /** Unique slug name; immutable after creation. */
  readonly name: string
  /** Timestamp when the change was created; immutable. */
  readonly createdAt: Date
  /** Optional free-text description of the change's purpose. */
  readonly description?: string
  /** Current snapshot of active workspace IDs. */
  readonly workspaces: string[]
  /** Current snapshot of spec paths being modified. */
  readonly specIds: string[]
  /** Context spec paths; populated at `ready` state; does not trigger invalidation. */
  readonly contextSpecIds?: string[]
  /** Append-only event history from which lifecycle state is derived. */
  readonly history: readonly ChangeEvent[]
  /** Pre-loaded artifact map; defaults to an empty map. */
  readonly artifacts?: Map<string, ChangeArtifact>
}

/**
 * The central domain entity representing an in-progress spec change.
 *
 * Lifecycle state is derived entirely from the `history` — the `to` field
 * of the most recent `transitioned` event. No `state` snapshot is stored.
 *
 * Every significant operation appends one or more events to `history`.
 * Events are never modified or removed.
 */
export class Change {
  private readonly _name: string
  private readonly _createdAt: Date
  private readonly _description: string | undefined
  private _workspaces: string[]
  private _specIds: string[]
  private _contextSpecIds: string[]
  private _history: ChangeEvent[]
  private _artifacts: Map<string, ChangeArtifact>

  /**
   * Creates a new `Change` from the given properties.
   *
   * @param props - Change construction properties
   */
  constructor(props: ChangeProps) {
    this._name = props.name
    this._createdAt = props.createdAt
    this._description = props.description
    this._workspaces = [...props.workspaces]
    this._specIds = [...props.specIds]
    this._contextSpecIds = [...(props.contextSpecIds ?? [])]
    this._history = [...props.history]
    this._artifacts =
      props.artifacts !== undefined ? new Map(props.artifacts) : new Map<string, ChangeArtifact>()
  }

  /** Unique slug name identifying this change. */
  get name(): string {
    return this._name
  }

  /** Timestamp when the change was created. */
  get createdAt(): Date {
    return new Date(this._createdAt.getTime())
  }

  /** Optional free-text description of the change's purpose. */
  get description(): string | undefined {
    return this._description
  }

  /** Schema name recorded at creation time, derived from the `created` history event. */
  get schemaName(): string {
    return this._createdEvent().schemaName
  }

  /** Schema version recorded at creation time, derived from the `created` history event. */
  get schemaVersion(): number {
    return this._createdEvent().schemaVersion
  }

  /** Current snapshot of workspace IDs this change belongs to. */
  get workspaces(): readonly string[] {
    return [...this._workspaces]
  }

  /** Current snapshot of spec paths being created or modified. */
  get specIds(): readonly string[] {
    return [...this._specIds]
  }

  /** Context spec paths that provide context but are not being modified. */
  get contextSpecIds(): readonly string[] {
    return [...this._contextSpecIds]
  }

  /** Read-only view of the append-only event history. */
  get history(): readonly ChangeEvent[] {
    return [...this._history]
  }

  /**
   * The current lifecycle state, derived from the most recent `transitioned`
   * event's `to` field. Returns `'drafting'` if no `transitioned` event exists.
   */
  get state(): ChangeState {
    for (let i = this._history.length - 1; i >= 0; i--) {
      const evt = this._history[i]
      if (evt !== undefined && evt.type === 'transitioned') return evt.to
    }
    return 'drafting'
  }

  /**
   * Whether the change is currently shelved in `drafts/`. Derived from
   * the most recent `drafted` or `restored` event.
   */
  get isDrafted(): boolean {
    for (let i = this._history.length - 1; i >= 0; i--) {
      const evt = this._history[i]
      if (evt === undefined) continue
      if (evt.type === 'drafted') return true
      if (evt.type === 'restored') return false
    }
    return false
  }

  /**
   * The active spec approval — the most recent `spec-approved` event that has
   * not been superseded by a subsequent `invalidated` event, or `undefined`.
   */
  get activeSpecApproval(): SpecApprovedEvent | undefined {
    let last: SpecApprovedEvent | undefined
    for (const evt of this._history) {
      if (evt.type === 'spec-approved') last = evt
      if (evt.type === 'invalidated') last = undefined
    }
    return last
  }

  /**
   * The active signoff — the most recent `signed-off` event that has not been
   * superseded by a subsequent `invalidated` event, or `undefined`.
   */
  get activeSignoff(): SignedOffEvent | undefined {
    let last: SignedOffEvent | undefined
    for (const evt of this._history) {
      if (evt.type === 'signed-off') last = evt
      if (evt.type === 'invalidated') last = undefined
    }
    return last
  }

  /** All artifacts currently attached to this change, keyed by type. */
  get artifacts(): ReadonlyMap<string, ChangeArtifact> {
    return new Map(this._artifacts)
  }

  /** Whether this change is in `archivable` state and may be archived. */
  get isArchivable(): boolean {
    return this.state === 'archivable'
  }

  /**
   * Computes the effective artifact status for `type`, cascading through
   * the dependency graph to reflect blocking dependencies.
   *
   * An artifact whose own hash matches its `validatedHash` is still reported
   * as `in-progress` if any artifact in its `requires` chain is neither
   * `complete` nor `skipped`.
   *
   * Includes cycle detection to prevent infinite recursion on circular
   * artifact dependencies.
   *
   * @param type - The artifact type ID to evaluate
   * @param visited - Set of already-visited artifact IDs (for cycle detection)
   * @returns The effective `ArtifactStatus` after dependency resolution
   */
  effectiveStatus(type: string, visited: Set<string> = new Set()): ArtifactStatus {
    const artifact = this._artifacts.get(type)
    if (!artifact) return 'missing'
    if (artifact.status === 'missing') return 'missing'
    if (visited.has(type)) return 'in-progress'

    visited.add(type)
    for (const req of artifact.requires) {
      const reqStatus = this.effectiveStatus(req, visited)
      if (reqStatus !== 'complete' && reqStatus !== 'skipped') return 'in-progress'
    }

    return artifact.status
  }

  /**
   * Attempts a lifecycle state transition, appending a `transitioned` event.
   *
   * @param to - The target state
   * @param actor - Git identity of the actor performing the transition
   * @throws {InvalidStateTransitionError} If the transition is not permitted
   */
  transition(to: ChangeState, actor: GitIdentity): void {
    const from = this.state
    if (!isValidTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to)
    }
    this._history.push({ type: 'transitioned', from, to, at: new Date(), by: actor })
  }

  /**
   * Records an invalidation, appending an `invalidated` event followed by a
   * `transitioned` event rolling back to `designing`.
   *
   * Called when workspaces, specIds, or artifact content changes and supersedes
   * any active spec approval or signoff.
   *
   * @param cause - The reason for invalidation
   * @param actor - Git identity of the actor triggering the change
   * @throws {InvalidStateTransitionError} If the current state cannot transition to `designing`
   */
  invalidate(cause: InvalidatedEvent['cause'], actor: GitIdentity): void {
    const from = this.state
    // Invalidation is a forced rollback — only throw if already in a terminal
    // state (archivable) where no further transitions are meaningful.
    if (from === 'archivable') {
      throw new InvalidStateTransitionError(from, 'designing')
    }
    const now = new Date()
    this._history.push({ type: 'invalidated', cause, at: now, by: actor })
    // Only push a transition event when we are not already in 'designing'.
    if (from !== 'designing') {
      this._history.push({ type: 'transitioned', from, to: 'designing', at: now, by: actor })
    }
    for (const artifact of this._artifacts.values()) {
      artifact.resetValidation()
    }
  }

  /**
   * Records that the spec approval gate has been passed.
   *
   * @param reason - Free-text rationale for the approval
   * @param artifactHashes - Hashes of the artifacts reviewed during approval
   * @param actor - Git identity of the approver
   */
  recordSpecApproval(
    reason: string,
    artifactHashes: Record<string, string>,
    actor: GitIdentity,
  ): void {
    this._history.push({ type: 'spec-approved', reason, artifactHashes, at: new Date(), by: actor })
  }

  /**
   * Records that the signoff gate has been passed.
   *
   * @param reason - Free-text rationale for the sign-off
   * @param artifactHashes - Hashes of the artifacts reviewed during sign-off
   * @param actor - Git identity of the approver
   */
  recordSignoff(reason: string, artifactHashes: Record<string, string>, actor: GitIdentity): void {
    this._history.push({ type: 'signed-off', reason, artifactHashes, at: new Date(), by: actor })
  }

  /**
   * Records that an optional artifact was explicitly skipped.
   *
   * @param artifactId - The artifact type ID that was skipped
   * @param actor - Git identity of the actor skipping the artifact
   * @param reason - Optional explanation for skipping
   */
  recordArtifactSkipped(artifactId: string, actor: GitIdentity, reason?: string): void {
    const event: ArtifactSkippedEvent =
      reason !== undefined
        ? { type: 'artifact-skipped', artifactId, at: new Date(), by: actor, reason }
        : { type: 'artifact-skipped', artifactId, at: new Date(), by: actor }
    this._history.push(event)
  }

  /**
   * Shelves this change to `drafts/`, appending a `drafted` event.
   *
   * @param actor - Git identity of the person shelving the change
   * @param reason - Optional explanation for shelving
   */
  draft(actor: GitIdentity, reason?: string): void {
    const event: DraftedEvent =
      reason !== undefined
        ? { type: 'drafted', at: new Date(), by: actor, reason }
        : { type: 'drafted', at: new Date(), by: actor }
    this._history.push(event)
  }

  /**
   * Recovers a drafted change back to `changes/`, appending a `restored` event.
   *
   * @param actor - Git identity of the person restoring the change
   */
  restore(actor: GitIdentity): void {
    this._history.push({ type: 'restored', at: new Date(), by: actor })
  }

  /**
   * Permanently abandons the change, appending a `discarded` event.
   *
   * @param reason - Mandatory explanation for discarding
   * @param actor - Git identity of the person discarding the change
   * @param supersededBy - Optional list of change names that replace this one
   */
  discard(reason: string, actor: GitIdentity, supersededBy?: readonly string[]): void {
    const event: DiscardedEvent =
      supersededBy !== undefined
        ? { type: 'discarded', reason, at: new Date(), by: actor, supersededBy }
        : { type: 'discarded', reason, at: new Date(), by: actor }
    this._history.push(event)
  }

  /**
   * Updates the workspace list and appends an invalidation.
   *
   * Any modification to workspaces always appends an `invalidated` event
   * followed by a `transitioned` event rolling back to `designing`.
   *
   * @param workspaces - The new workspace IDs
   * @param actor - Git identity of the actor making the change
   */
  updateWorkspaces(workspaces: readonly string[], actor: GitIdentity): void {
    this._workspaces = [...workspaces]
    this.invalidate('workspace-change', actor)
  }

  /**
   * Updates the spec ID list and appends an invalidation.
   *
   * Any modification to specIds always appends an `invalidated` event
   * followed by a `transitioned` event rolling back to `designing`.
   *
   * @param specIds - The new spec paths
   * @param actor - Git identity of the actor making the change
   */
  updateSpecIds(specIds: readonly string[], actor: GitIdentity): void {
    this._specIds = [...specIds]
    this.invalidate('spec-change', actor)
  }

  /**
   * Updates the context spec IDs without appending any event.
   *
   * Modifications to `contextSpecIds` alone do not trigger invalidation.
   *
   * @param contextSpecIds - The new context spec paths
   */
  updateContextSpecIds(contextSpecIds: readonly string[]): void {
    this._contextSpecIds = [...contextSpecIds]
  }

  /**
   * Updates the workspaces snapshot without appending any event or triggering invalidation.
   *
   * Used when workspace membership is derived from a `specIds` change that
   * already caused an `invalidated` event — the workspace snapshot is brought
   * in line with the new spec scope without emitting a redundant
   * `workspace-change` invalidation.
   *
   * @param workspaces - The new workspace IDs
   */
  setWorkspacesSnapshot(workspaces: readonly string[]): void {
    this._workspaces = [...workspaces]
  }

  /**
   * Asserts that this change is in `archivable` state.
   *
   * @throws {InvalidStateTransitionError} If the change is not in `archivable` state
   */
  assertArchivable(): void {
    if (!this.isArchivable) {
      throw new InvalidStateTransitionError(this.state, 'archivable')
    }
  }

  /**
   * Resets the validation state for the specified artifacts.
   *
   * Called when transitioning `verifying → implementing` to clear only the
   * artifacts listed in the `implementing` workflow step's `requires` field.
   *
   * @param artifactIds - The artifact type IDs whose validation is cleared
   */
  clearArtifactValidations(artifactIds: readonly string[]): void {
    for (const id of artifactIds) {
      this._artifacts.get(id)?.resetValidation()
    }
  }

  /**
   * Adds or replaces an artifact on this change, keyed by its type.
   *
   * @param artifact - The artifact to attach
   */
  setArtifact(artifact: ChangeArtifact): void {
    this._artifacts.set(artifact.type, artifact)
  }

  /**
   * Returns the artifact of the given type, or `null` if not present.
   *
   * @param type - The artifact type ID to look up
   * @returns The artifact, or `null` if not found
   */
  getArtifact(type: string): ChangeArtifact | null {
    return this._artifacts.get(type) ?? null
  }

  /**
   * Returns the `created` event from the history.
   *
   * @returns The `created` event
   * @throws {CorruptedManifestError} If no `created` event exists — every Change must have one
   */
  private _createdEvent(): CreatedEvent {
    const event = this._history.find((e): e is CreatedEvent => e.type === 'created')
    if (event === undefined) {
      throw new CorruptedManifestError(this._name)
    }
    return event
  }
}
