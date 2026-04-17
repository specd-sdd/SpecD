import { type ChangeState, isValidTransition } from '../value-objects/change-state.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { InvalidStateTransitionError } from '../errors/invalid-state-transition-error.js'
import { InvalidChangeError } from '../errors/invalid-change-error.js'
import { CorruptedManifestError } from '../errors/corrupted-manifest-error.js'
import { HistoricalImplementationGuardError } from '../errors/historical-implementation-guard-error.js'
import { ChangeArtifact } from './change-artifact.js'
import { ArtifactFile } from '../value-objects/artifact-file.js'
import { type ArtifactType } from '../value-objects/artifact-type.js'
import { parseSpecId } from '../services/parse-spec-id.js'
import * as path from 'node:path'

/** Kebab-case pattern for change names: lowercase alphanumeric segments separated by hyphens. */
const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Identity of the actor performing an operation. */
export interface ActorIdentity {
  readonly name: string
  readonly email: string
}

/** Appended once when the change is first created. */
export interface CreatedEvent {
  readonly type: 'created'
  readonly at: Date
  readonly by: ActorIdentity
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
}

/** Appended on each lifecycle state transition. */
export interface TransitionedEvent {
  readonly type: 'transitioned'
  readonly at: Date
  readonly by: ActorIdentity
  readonly from: ChangeState
  readonly to: ChangeState
}

/** Appended when the spec approval gate is passed. */
export interface SpecApprovedEvent {
  readonly type: 'spec-approved'
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
}

/** Appended when the signoff gate is passed. */
export interface SignedOffEvent {
  readonly type: 'signed-off'
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
}

/** Appended when specIds or artifact content changes, superseding approvals. */
export interface InvalidatedArtifactEntry {
  readonly type: string
  readonly files: readonly string[]
}

/** Appended when specIds or artifact content changes, superseding approvals. */
export interface InvalidatedEvent {
  readonly type: 'invalidated'
  readonly at: Date
  readonly by: ActorIdentity
  readonly cause:
    | 'spec-change'
    | 'artifact-drift'
    | 'artifact-review-required'
    | 'spec-overlap-conflict'
  readonly message: string
  readonly affectedArtifacts: readonly InvalidatedArtifactEntry[]
}

/** Appended when the change is shelved to `drafts/`. */
export interface DraftedEvent {
  readonly type: 'drafted'
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason?: string
}

/** Appended when a drafted change is moved back to `changes/`. */
export interface RestoredEvent {
  readonly type: 'restored'
  readonly at: Date
  readonly by: ActorIdentity
}

/** Appended when a change is permanently abandoned. */
export interface DiscardedEvent {
  readonly type: 'discarded'
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
  readonly supersededBy?: readonly string[]
}

/** Appended when an optional artifact is explicitly skipped. */
export interface ArtifactSkippedEvent {
  readonly type: 'artifact-skipped'
  readonly at: Date
  readonly by: ActorIdentity
  readonly artifactId: string
  readonly reason?: string
}

/** System actor identity used for automated operations like artifact sync. */
export const SYSTEM_ACTOR: ActorIdentity = { name: 'specd', email: 'system@getspecd.dev' }

/** Appended when artifact sync reconciles the artifact map against the schema. */
export interface ArtifactsSyncedEvent {
  readonly type: 'artifacts-synced'
  readonly at: Date
  readonly by: ActorIdentity
  /** Artifact type IDs added by the sync. */
  readonly typesAdded: readonly string[]
  /** Artifact type IDs removed by the sync. */
  readonly typesRemoved: readonly string[]
  /** Files added within existing or new artifacts. */
  readonly filesAdded: ReadonlyArray<{ readonly type: string; readonly key: string }>
  /** Files removed from existing artifacts. */
  readonly filesRemoved: ReadonlyArray<{ readonly type: string; readonly key: string }>
}

/** Appended when the change description is updated. Does NOT trigger invalidation. */
export interface DescriptionUpdatedEvent {
  readonly type: 'description-updated'
  readonly at: Date
  readonly by: ActorIdentity
  readonly description: string
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
  | ArtifactsSyncedEvent
  | DescriptionUpdatedEvent

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
  /** Current snapshot of spec paths being modified. */
  readonly specIds: readonly string[]
  /** Append-only event history from which lifecycle state is derived. */
  readonly history: readonly ChangeEvent[]
  /** Pre-loaded artifact map; defaults to an empty map. */
  readonly artifacts?: Map<string, ChangeArtifact>
  /** Per-spec declared dependencies, keyed by spec ID. */
  readonly specDependsOn?: ReadonlyMap<string, readonly string[]>
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
  private _description: string | undefined
  private _specIds: string[]
  private _history: ChangeEvent[]
  private _artifacts: Map<string, ChangeArtifact>
  private _specDependsOn: Map<string, string[]>

  /**
   * Creates a new `Change` from the given properties.
   *
   * @param props - Change construction properties
   */
  constructor(props: ChangeProps) {
    if (!CHANGE_NAME_PATTERN.test(props.name)) {
      throw new InvalidChangeError(
        `invalid change name '${props.name}' — must be kebab-case (lowercase alphanumeric segments separated by hyphens)`,
      )
    }
    this._name = props.name
    this._createdAt = new Date(props.createdAt.getTime())
    this._description = props.description
    this._specIds = [...new Set(props.specIds)]
    this._history = [...props.history]
    this._artifacts =
      props.artifacts !== undefined ? new Map(props.artifacts) : new Map<string, ChangeArtifact>()
    this._specDependsOn = new Map<string, string[]>()
    if (props.specDependsOn !== undefined) {
      for (const [key, deps] of props.specDependsOn) {
        this._specDependsOn.set(key, [...deps])
      }
    }
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

  /** Workspace IDs derived from specIds at runtime. */
  get workspaces(): readonly string[] {
    const set = new Set<string>()
    for (const id of this._specIds) {
      set.add(parseSpecId(id).workspace)
    }
    return [...set]
  }

  /** Current snapshot of spec paths being created or modified. */
  get specIds(): readonly string[] {
    return [...this._specIds]
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
   * Whether the change has ever reached the `implementing` lifecycle state.
   *
   * Derived from the append-only history by scanning for any
   * `transitioned` event whose `to` field is `'implementing'`.
   * This is a temporary pragmatic heuristic until specd can detect
   * whether a change has actually modified code files.
   *
   * The signal is historical, not state-based — it remains true once
   * reached regardless of subsequent state transitions.
   */
  get hasEverReachedImplementing(): boolean {
    return this._history.some(
      (evt): evt is TransitionedEvent => evt.type === 'transitioned' && evt.to === 'implementing',
    )
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

  /**
   * Per-spec declared dependencies, keyed by spec ID.
   *
   * Used by `CompileContext` as the highest-priority source for `dependsOn`
   * resolution. Not subject to approval invalidation.
   */
  get specDependsOn(): ReadonlyMap<string, readonly string[]> {
    return new Map(this._specDependsOn)
  }

  /**
   * Sets (replaces) the declared dependencies for a single spec.
   *
   * Does **not** trigger invalidation — `specDependsOn` is advisory,
   * not spec content.
   *
   * @param specId - The spec whose dependencies to set
   * @param deps - The new dependency list
   */
  setSpecDependsOn(specId: string, deps: readonly string[]): void {
    this._specDependsOn.set(specId, [...deps])
  }

  /**
   * Removes the declared dependencies entry for a single spec.
   *
   * @param specId - The spec whose dependencies to remove
   */
  removeSpecDependsOn(specId: string): void {
    this._specDependsOn.delete(specId)
  }

  /** Whether this change is in `archivable` or `archiving` state and may be archived. */
  get isArchivable(): boolean {
    return this.state === 'archivable' || this.state === 'archiving'
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
   * @returns The effective `ArtifactStatus` after dependency resolution
   */
  effectiveStatus(type: string): ArtifactStatus {
    return this._effectiveStatus(type, new Set())
  }

  /**
   * Internal recursive helper for `effectiveStatus` with cycle detection.
   *
   * @param type - The artifact type ID to evaluate
   * @param visiting - Set of already-visited artifact IDs for cycle detection
   * @returns The effective `ArtifactStatus` after dependency resolution
   */
  private _effectiveStatus(type: string, visiting: Set<string>): ArtifactStatus {
    const artifact = this._artifacts.get(type)
    if (!artifact) return 'missing'
    if (artifact.status === 'missing') return 'missing'
    if (visiting.has(type)) return 'in-progress'

    visiting.add(type)
    for (const req of artifact.requires) {
      const reqStatus = this._effectiveStatus(req, visiting)
      if (reqStatus !== 'complete' && reqStatus !== 'skipped') {
        visiting.delete(type)
        return 'in-progress'
      }
    }
    visiting.delete(type)

    return artifact.status
  }

  /**
   * Attempts a lifecycle state transition, appending a `transitioned` event.
   *
   * @param to - The target state
   * @param actor - Identity of the actor performing the transition
   * @throws {InvalidStateTransitionError} If the transition is not permitted
   */
  transition(to: ChangeState, actor: ActorIdentity): void {
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
   * Called when specIds or artifact content changes and supersedes any active
   * spec approval or signoff.
   *
   * @param cause - The reason for invalidation
   * @param actor - Identity of the actor triggering the change
   * @param message - Human-readable invalidation summary
   * @param affectedArtifacts - Artifact/file payload that triggered the invalidation
   */
  invalidate(
    cause: InvalidatedEvent['cause'],
    actor: ActorIdentity,
    message: string = 'Invalidated because artifacts require review.',
    affectedArtifacts: readonly InvalidatedArtifactEntry[] = [...this._artifacts.values()].map(
      (artifact) => ({
        type: artifact.type,
        files: [...artifact.files.keys()],
      }),
    ),
  ): void {
    const from = this.state
    const now = new Date()
    this._history.push({
      type: 'invalidated',
      cause,
      message,
      affectedArtifacts,
      at: now,
      by: actor,
    })
    // Only push a transition event when we are not already in 'designing'.
    if (from !== 'designing') {
      this._history.push({ type: 'transitioned', from, to: 'designing', at: now, by: actor })
    }

    const affectedMap = new Map<string, readonly string[]>(
      affectedArtifacts.map((artifact) => [artifact.type, [...artifact.files]]),
    )

    if (cause === 'artifact-drift') {
      for (const [type, keys] of affectedMap) {
        this._artifacts.get(type)?.markDriftedPendingReview(keys)
      }
    }

    for (const [typeId, artifact] of this._artifacts) {
      if (affectedMap.has(typeId) && cause === 'artifact-drift') continue
      artifact.markPendingReview()
    }
  }

  /**
   * Records that the spec approval gate has been passed.
   *
   * @param reason - Free-text rationale for the approval
   * @param artifactHashes - Hashes of the artifacts reviewed during approval
   * @param actor - Identity of the approver
   */
  recordSpecApproval(
    reason: string,
    artifactHashes: Record<string, string>,
    actor: ActorIdentity,
  ): void {
    this._history.push({ type: 'spec-approved', reason, artifactHashes, at: new Date(), by: actor })
  }

  /**
   * Records that the signoff gate has been passed.
   *
   * @param reason - Free-text rationale for the sign-off
   * @param artifactHashes - Hashes of the artifacts reviewed during sign-off
   * @param actor - Identity of the approver
   */
  recordSignoff(
    reason: string,
    artifactHashes: Record<string, string>,
    actor: ActorIdentity,
  ): void {
    this._history.push({ type: 'signed-off', reason, artifactHashes, at: new Date(), by: actor })
  }

  /**
   * Records that an optional artifact was explicitly skipped.
   *
   * @param artifactId - The artifact type ID that was skipped
   * @param actor - Identity of the actor skipping the artifact
   * @param reason - Optional explanation for skipping
   */
  recordArtifactSkipped(artifactId: string, actor: ActorIdentity, reason?: string): void {
    const event: ArtifactSkippedEvent =
      reason !== undefined
        ? { type: 'artifact-skipped', artifactId, at: new Date(), by: actor, reason }
        : { type: 'artifact-skipped', artifactId, at: new Date(), by: actor }
    this._history.push(event)
  }

  /**
   * Shelves this change to `drafts/`, appending a `drafted` event.
   *
   * If the change has ever reached `implementing`, drafting is blocked
   * by default because implementation may already exist and shelving
   * the change would risk leaving permanent specs and code out of sync.
   * Pass `force: true` to bypass this guard intentionally.
   *
   * @param actor - Identity of the person shelving the change
   * @param reason - Optional explanation for shelving
   * @param force - Explicit override for the historical implementation guard
   * @throws {HistoricalImplementationGuardError} If the change has ever
   *   reached `implementing` and `force` is not `true`
   */
  draft(actor: ActorIdentity, reason?: string, force?: boolean): void {
    if (this.hasEverReachedImplementing && force !== true) {
      throw new HistoricalImplementationGuardError('draft', this._name)
    }
    const event: DraftedEvent =
      reason !== undefined
        ? { type: 'drafted', at: new Date(), by: actor, reason }
        : { type: 'drafted', at: new Date(), by: actor }
    this._history.push(event)
  }

  /**
   * Recovers a drafted change back to `changes/`, appending a `restored` event.
   *
   * @param actor - Identity of the person restoring the change
   */
  restore(actor: ActorIdentity): void {
    this._history.push({ type: 'restored', at: new Date(), by: actor })
  }

  /**
   * Permanently abandons the change, appending a `discarded` event.
   *
   * If the change has ever reached `implementing`, discarding is blocked
   * by default because implementation may already exist and abandoning
   * the workflow would risk leaving permanent specs and code out of sync.
   * Pass `force: true` to bypass this guard intentionally.
   *
   * @param reason - Mandatory explanation for discarding
   * @param actor - Identity of the person discarding the change
   * @param supersededBy - Optional list of change names that replace this one
   * @param force - Explicit override for the historical implementation guard
   * @throws {HistoricalImplementationGuardError} If the change has ever
   *   reached `implementing` and `force` is not `true`
   */
  discard(
    reason: string,
    actor: ActorIdentity,
    supersededBy?: readonly string[],
    force?: boolean,
  ): void {
    if (this.hasEverReachedImplementing && force !== true) {
      throw new HistoricalImplementationGuardError('discard', this._name)
    }
    const event: DiscardedEvent =
      supersededBy !== undefined
        ? { type: 'discarded', reason, at: new Date(), by: actor, supersededBy }
        : { type: 'discarded', reason, at: new Date(), by: actor }
    this._history.push(event)
  }

  /**
   * Updates the spec ID list and appends an invalidation.
   *
   * Any modification to specIds always appends an `invalidated` event
   * followed by a `transitioned` event rolling back to `designing`.
   *
   * @param specIds - The new spec paths
   * @param actor - Identity of the actor making the change
   */
  updateSpecIds(specIds: readonly string[], actor: ActorIdentity): void {
    this._specIds = [...new Set(specIds)]
    const newIds = new Set(this._specIds)
    for (const key of this._specDependsOn.keys()) {
      if (!newIds.has(key)) this._specDependsOn.delete(key)
    }
    this.invalidate(
      'spec-change',
      actor,
      'Invalidated because the change scope changed and artifacts require review.',
      [...this._artifacts.values()].map((artifact) => ({
        type: artifact.type,
        files: [...artifact.files.keys()],
      })),
    )
  }

  /**
   * Updates the description of this change.
   * Does NOT trigger invalidation — only updates metadata.
   *
   * @param description - The new description
   * @param actor - Identity of the actor making the change
   */
  updateDescription(description: string, actor: ActorIdentity): void {
    this._description = description
    this._history.push({
      type: 'description-updated',
      at: new Date(),
      by: actor,
      description,
    })
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
   * Synchronises the artifact map against the current schema artifact types
   * and spec IDs.
   *
   * For each artifact type:
   * - Creates the `ChangeArtifact` if missing
   * - For `scope: 'change'`: ensures one `ArtifactFile` keyed by the type id,
   *   filename = basename from `artifactType.output`
   * - For `scope: 'spec'`: ensures one `ArtifactFile` per specId,
   *   filename = basename from `artifactType.output`
   * - Removes files for specIds no longer in the change
   * - Removes artifacts for types no longer in the schema
   * - Preserves existing `validatedHash` and `state` for surviving entries
   *
   * If the sync produces any changes, an `artifacts-synced` event is appended
   * to the history.
   *
   * Pure method with no I/O. Called by the repository layer on every `get()`
   * and `save()` to keep the artifact map in sync with schema x specIds.
   *
   * @param artifactTypes - The resolved artifact types from the active schema
   * @returns `true` if any changes were made, `false` if the artifact map was already in sync
   */
  syncArtifacts(artifactTypes: readonly ArtifactType[]): boolean {
    const typeIds = new Set(artifactTypes.map((t) => t.id))
    const typesAdded: string[] = []
    const typesRemoved: string[] = []
    const filesAdded: Array<{ type: string; key: string }> = []
    const filesRemoved: Array<{ type: string; key: string }> = []

    // Remove artifacts for types no longer in schema
    for (const existingType of this._artifacts.keys()) {
      if (!typeIds.has(existingType)) {
        typesRemoved.push(existingType)
        this._artifacts.delete(existingType)
      }
    }

    const currentSpecIds = new Set(this._specIds)

    for (const artifactType of artifactTypes) {
      let artifact = this._artifacts.get(artifactType.id)
      if (artifact === undefined) {
        artifact = new ChangeArtifact({
          type: artifactType.id,
          optional: artifactType.optional,
          requires: artifactType.requires,
        })
        this._artifacts.set(artifactType.id, artifact)
        typesAdded.push(artifactType.id)
      }

      const outputBasename = path.basename(artifactType.output)

      if (artifactType.scope === 'change') {
        // One file keyed by type id, filename = basename (lives in change root)
        if (artifact.getFile(artifactType.id) === undefined) {
          artifact.setFile(
            new ArtifactFile({
              key: artifactType.id,
              filename: outputBasename,
            }),
          )
          filesAdded.push({ type: artifactType.id, key: artifactType.id })
        }
      } else {
        // scope: 'spec' — one file per specId, filename = full relative path
        // e.g. specs/core/retry-policy/spec.md

        // Add files for new specIds
        for (const specId of this._specIds) {
          if (artifact.getFile(specId) === undefined) {
            const { workspace: ws, capPath: cp } = parseSpecId(specId)
            const relPath =
              cp.length > 0
                ? `specs/${ws}/${cp}/${outputBasename}`
                : `specs/${ws}/${outputBasename}`
            artifact.setFile(
              new ArtifactFile({
                key: specId,
                filename: relPath,
              }),
            )
            filesAdded.push({ type: artifactType.id, key: specId })
          }
        }

        // Remove files for specIds no longer in the change
        for (const [key] of artifact.files) {
          if (!currentSpecIds.has(key)) {
            artifact.removeFile(key)
            filesRemoved.push({ type: artifactType.id, key })
          }
        }
      }
    }

    const changed =
      typesAdded.length > 0 ||
      typesRemoved.length > 0 ||
      filesAdded.length > 0 ||
      filesRemoved.length > 0

    if (changed) {
      this._history.push({
        type: 'artifacts-synced',
        at: new Date(),
        by: SYSTEM_ACTOR,
        typesAdded,
        typesRemoved,
        filesAdded,
        filesRemoved,
      })
    }

    return changed
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
