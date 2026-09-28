import {
  type ChangeState,
  RECOVERY_ONLY_TRANSITIONS,
  isValidTransition,
} from '../value-objects/change-state.js'
import { type AutomaticRecovery } from '../services/change-validity.js'
import { InvalidStateTransitionError } from '../errors/invalid-state-transition-error.js'
import { InvalidChangeError } from '../errors/invalid-change-error.js'
import { CorruptedManifestError } from '../errors/corrupted-manifest-error.js'
import { HistoricalImplementationGuardError } from '../errors/historical-implementation-guard-error.js'
import { ChangeArtifact } from './change-artifact.js'
import { ArtifactFile } from '../value-objects/artifact-file.js'
import { type ArtifactDag } from '../value-objects/artifact-dag.js'
import { type ArtifactType } from '../value-objects/artifact-type.js'
import {
  type InvalidationPolicy,
  type ArtifactInvalidationPolicy,
  DEFAULT_INVALIDATION_POLICY,
  isInvalidationPolicy,
  fromLegacyInvalidationPolicy,
} from '../value-objects/invalidation-policy.js'
import {
  type ArtifactFingerprint,
  type SpecApprovalFingerprint,
  type ImplementationFingerprint,
  type ValidityFingerprint,
  type FingerprintDifference,
  type ArtifactFingerprintAlgorithm,
  type Sha256Digest,
  type TextNormalizationAlgorithm,
  type BinaryNormalizationAlgorithm,
} from '../value-objects/validity-fingerprint.js'
import { parseSpecId } from '../services/parse-spec-id.js'
import { expectedArtifactFilename } from '../services/artifact-filename.js'

/** Kebab-case pattern for change names: lowercase alphanumeric segments separated by hyphens. */
const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Identity of the actor performing an operation. */
export interface ActorIdentity {
  readonly name: string
  readonly email: string
  /** Optional provider identifier (e.g. 'git', 'ldap', 'sso'). */
  readonly provider?: string
  /** Optional unique identifier within the provider (e.g. LDAP DN, employee ID). */
  readonly providerId?: string
  /** Optional bag of additional identity metadata. */
  readonly metadata?: Record<string, string>
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
  readonly fingerprint?: SpecApprovalFingerprint
}

/** Appended when the signoff gate is passed. */
export interface SignedOffEvent {
  readonly type: 'signed-off'
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
}

/**
 * Appended when an active signoff is cleared without redesign.
 *
 * Does not supersede spec approval and does not reopen artifacts.
 */
export interface SignoffInvalidatedEvent {
  readonly type: 'signoff-invalidated'
  readonly at: Date
  readonly by: ActorIdentity
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

/** Archive execution phase used for failed-attempt diagnostics. */
export type ArchiveFailureStep = 'prepare' | 'commit' | 'archive' | 'metadata'

/** Appended when an archive attempt fails before successful completion. */
export interface ArchiveFailedEvent {
  readonly type: 'archive-failed'
  readonly at: Date
  readonly by: ActorIdentity
  readonly step: ArchiveFailureStep
  readonly message: string
  readonly commitStarted: boolean
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
export const SYSTEM_ACTOR: ActorIdentity = {
  name: 'specd',
  email: 'system@getspecd.dev',
  provider: 'system',
} as const

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

/** Status of a materialized validity projection. */
export type ProjectionStatus = 'valid' | 'stale' | 'revoked'

/** Specific cause for projection invalidation. */
export type ValidityInvalidationCause =
  | 'artifact-drift'
  | 'implementation-drift'
  | 'scope-change'
  | 'manual-invalidation'
  | 'verification-invalidated'
  | 'spec-overlap-conflict'
  | 'legacy-unknown'

/** Recorded invalidation facts attached to a stale or revoked projection. */
export interface ProjectionInvalidation {
  readonly at: Date
  readonly by: ActorIdentity
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

/** Recorded human approval decision. */
export interface ApprovalDecision {
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
}

/** Materialized projection of current spec approval validity. */
export interface SpecApprovalProjection {
  readonly status: ProjectionStatus
  readonly decision: ApprovalDecision
  readonly fingerprint: SpecApprovalFingerprint
  readonly invalidation?: ProjectionInvalidation
}

/** Materialized projection of current sign-off validity. */
export interface SignoffProjection {
  readonly status: ProjectionStatus
  readonly decision: ApprovalDecision
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly verificationId: string | null
  readonly invalidation?: ProjectionInvalidation
}

/** An active or historical verification attempt baseline. */
export interface VerificationAttempt {
  readonly id: string
  readonly startedAt: Date
  readonly startedBy: ActorIdentity
  readonly startedIn: ChangeState
  readonly baseline: ValidityFingerprint
}

/** Materialized projection of completed verification evidence. */
export interface CompletedVerification {
  readonly id: string
  readonly attemptId: string
  readonly status: 'valid' | 'stale'
  readonly completedAt: Date
  readonly completedBy: ActorIdentity
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly invalidation?: ProjectionInvalidation
}

/** Combined verification projection covering active attempt and completed evidence. */
export interface VerificationProjection {
  readonly activeAttempt?: VerificationAttempt
  readonly completed?: CompletedVerification
}

/** Appended when a gate projection (spec or signoff) is invalidated. */
export interface ApprovalInvalidatedEvent {
  readonly type: 'approval-invalidated'
  readonly at: Date
  readonly by: ActorIdentity
  readonly gate: 'spec' | 'signoff'
  readonly status: 'stale' | 'revoked'
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

/** Appended when a new verification attempt is started. */
export interface VerificationAttemptStartedEvent {
  readonly type: 'verification-attempt-started'
  readonly at: Date
  readonly by: ActorIdentity
  readonly attemptId: string
  readonly state: ChangeState
  readonly fingerprintVersion: 1
  readonly artifactAlgorithm: ArtifactFingerprintAlgorithm
  readonly textNormalization: TextNormalizationAlgorithm
  readonly binaryNormalization: BinaryNormalizationAlgorithm
}

/** Appended when an active verification attempt completes successfully. */
export interface VerificationCompletedEvent {
  readonly type: 'verification-completed'
  readonly at: Date
  readonly by: ActorIdentity
  readonly attemptId: string
  readonly verificationId: string
}

/** Appended when completed verification evidence is explicitly marked stale. */
export interface VerificationInvalidatedEvent {
  readonly type: 'verification-invalidated'
  readonly at: Date
  readonly by: ActorIdentity
  readonly verificationId: string
  readonly reason: string
}

/** Discriminated union of all change history event types. */
export type ChangeEvent =
  | CreatedEvent
  | TransitionedEvent
  | SpecApprovedEvent
  | SignedOffEvent
  | SignoffInvalidatedEvent
  | InvalidatedEvent
  | ArchiveFailedEvent
  | DraftedEvent
  | RestoredEvent
  | DiscardedEvent
  | ArtifactSkippedEvent
  | ArtifactsSyncedEvent
  | DescriptionUpdatedEvent
  | ApprovalInvalidatedEvent
  | VerificationAttemptStartedEvent
  | VerificationCompletedEvent
  | VerificationInvalidatedEvent

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
  /**
   * Last modification timestamp.
   *
   * Defaults to `createdAt` when omitted at construction.
   */
  readonly updatedAt?: Date
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
  /**
   * Invalidation policy for this change.
   * A legacy artifact scalar is mapped to `{ artifacts, workflow: 'redesign' }`.
   * Omission uses the native default.
   */
  readonly invalidationPolicy?: InvalidationPolicy | ArtifactInvalidationPolicy
  /** Tracked implementation files under review for the active change. */
  readonly trackedImplementationFiles?: readonly TrackedImplementationFile[]
  /** Confirmed implementation links for the active change. */
  readonly implementationLinks?: readonly ImplementationLink[]
  /** Timestamp when implementation tracking commenced, or null/undefined if inactive. */
  readonly implementationTrackingStartedAt?: Date | null
  /** Materialized spec approval projection. */
  readonly specApproval?: SpecApprovalProjection
  /** Materialized signoff projection. */
  readonly signoff?: SignoffProjection
  /** Materialized verification projection. */
  readonly verification?: VerificationProjection
}

/** Explicit review states for tracked implementation files. */
export type TrackedImplementationFileState = 'open' | 'resolved' | 'ignored' | 'removed'

/** One tracked implementation file under review for a change. */
export interface TrackedImplementationFile {
  /** Raw project-relative file path. */
  readonly file: string
  /** Explicit review state for the tracked file. */
  readonly state: TrackedImplementationFileState
}

/** One confirmed `spec + file` implementation link. */
export interface ImplementationLink {
  /** Canonical spec ID implemented by the linked file/symbols. */
  readonly specId: string
  /** Raw project-relative file path. */
  readonly file: string
  /**
   * Whether the file-level link was explicitly created.
   *
   * `false` means the file-level presence exists only as the container for
   * symbol-level refinements.
   */
  readonly fileLinkExplicit: boolean
  /** Optional symbol-level refinements attached to this `spec + file` link. */
  readonly symbols?: readonly string[]
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
  private _updatedAt: Date
  private _description: string | undefined
  private _specIds: string[]
  private _history: ChangeEvent[]
  private _artifacts: Map<string, ChangeArtifact>
  private _specDependsOn: Map<string, string[]>
  private _invalidationPolicy: InvalidationPolicy
  private _trackedImplementationFiles: Map<string, TrackedImplementationFileState>
  private _implementationLinks: Map<string, ImplementationLink>
  private _implementationTrackingStartedAt: Date | null
  private _specApproval: SpecApprovalProjection | undefined
  private _signoff: SignoffProjection | undefined
  private _verification: VerificationProjection

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
    const updatedAt = props.updatedAt ?? props.createdAt
    if (updatedAt.getTime() < this._createdAt.getTime()) {
      throw new InvalidChangeError('updatedAt must not be before createdAt')
    }
    this._updatedAt = new Date(updatedAt.getTime())
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
    this._invalidationPolicy =
      props.invalidationPolicy !== undefined
        ? isInvalidationPolicy(props.invalidationPolicy)
          ? props.invalidationPolicy
          : fromLegacyInvalidationPolicy(props.invalidationPolicy)
        : DEFAULT_INVALIDATION_POLICY
    this._trackedImplementationFiles = new Map<string, TrackedImplementationFileState>()
    if (props.trackedImplementationFiles !== undefined) {
      for (const entry of props.trackedImplementationFiles) {
        this._trackedImplementationFiles.set(entry.file, entry.state)
      }
    }
    this._implementationLinks = new Map<string, ImplementationLink>()
    if (props.implementationLinks !== undefined) {
      for (const link of props.implementationLinks) {
        this._setImplementationLink(link)
      }
    }
    if (props.implementationTrackingStartedAt !== undefined) {
      this._implementationTrackingStartedAt =
        props.implementationTrackingStartedAt !== null
          ? new Date(props.implementationTrackingStartedAt.getTime())
          : null
    } else {
      this._implementationTrackingStartedAt = this.getHistoricalImplementationAt()
    }
    this._specApproval = props.specApproval ? { ...props.specApproval } : undefined
    this._signoff = props.signoff ? { ...props.signoff } : undefined
    this._verification = props.verification ? { ...props.verification } : {}
  }

  /** Unique slug name identifying this change. */
  get name(): string {
    return this._name
  }

  /** Timestamp when the change was created. */
  get createdAt(): Date {
    return new Date(this._createdAt.getTime())
  }

  /** Timestamp when the change was last modified. */
  get updatedAt(): Date {
    return new Date(this._updatedAt.getTime())
  }

  /**
   * Sets or advances the change revision timestamp.
   *
   * @param at - Timestamp to record; defaults to the current date/time
   * @throws {InvalidChangeError} When `at` is before `createdAt`
   */
  touchUpdatedAt(at: Date = new Date()): void {
    if (at.getTime() < this._createdAt.getTime()) {
      throw new InvalidChangeError('updatedAt must not be before createdAt')
    }
    this._updatedAt = new Date(at.getTime())
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
    return this.getHistoricalImplementationAt() !== null
  }

  /** Timestamp when implementation tracking started, or null if inactive. */
  get implementationTrackingStartedAt(): Date | null {
    return this._implementationTrackingStartedAt !== null
      ? new Date(this._implementationTrackingStartedAt.getTime())
      : null
  }

  /** Whether implementation tracking is currently active for this change. */
  get isImplementationTrackingActive(): boolean {
    return this._implementationTrackingStartedAt !== null
  }

  /** Tracked implementation files under review for the active change. */
  get trackedImplementationFiles(): readonly TrackedImplementationFile[] {
    return [...this._trackedImplementationFiles.entries()].map(([file, state]) => ({ file, state }))
  }

  /** Confirmed implementation links for the active change. */
  get implementationLinks(): readonly ImplementationLink[] {
    return [...this._implementationLinks.values()].map((link) => ({
      ...link,
      ...(link.symbols !== undefined ? { symbols: [...link.symbols] } : {}),
    }))
  }

  /** Materialized spec approval projection, or undefined if never approved. */
  get specApproval(): SpecApprovalProjection | undefined {
    return this._specApproval ? { ...this._specApproval } : undefined
  }

  /** Materialized signoff projection, or undefined if never signed off. */
  get signoff(): SignoffProjection | undefined {
    return this._signoff ? { ...this._signoff } : undefined
  }

  /** Materialized verification projection covering active attempt and completed evidence. */
  get verification(): VerificationProjection {
    return {
      ...(this._verification.activeAttempt
        ? { activeAttempt: { ...this._verification.activeAttempt } }
        : {}),
      ...(this._verification.completed ? { completed: { ...this._verification.completed } } : {}),
    }
  }

  /**
   * The active spec approval — the most recent `spec-approved` event when the
   * current spec approval projection is `valid`, or `undefined`.
   */
  get activeSpecApproval(): SpecApprovedEvent | undefined {
    if (this._specApproval !== undefined && this._specApproval.status !== 'valid') {
      return undefined
    }
    let last: SpecApprovedEvent | undefined
    for (const evt of this._history) {
      if (evt.type === 'spec-approved') last = evt
      if (evt.type === 'invalidated') last = undefined
    }
    return last
  }

  /**
   * The active signoff — the most recent `signed-off` event when the
   * current signoff projection is `valid`, or `undefined`.
   */
  get activeSignoff(): SignedOffEvent | undefined {
    if (this._signoff !== undefined && this._signoff.status !== 'valid') {
      return undefined
    }
    let last: SignedOffEvent | undefined
    for (const evt of this._history) {
      if (evt.type === 'signed-off') last = evt
      if (evt.type === 'invalidated' || evt.type === 'signoff-invalidated') last = undefined
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

  /** The invalidation policy persisted on this change. */
  get invalidationPolicy(): InvalidationPolicy {
    return this._invalidationPolicy
  }

  /**
   * Returns when this change first entered `implementing`, or `null` when it
   * has never done so.
   *
   * @returns The first `implementing` timestamp, or `null`
   */
  getHistoricalImplementationAt(): Date | null {
    for (const evt of this._history) {
      if (evt.type === 'transitioned' && evt.to === 'implementing') {
        return new Date(evt.at.getTime())
      }
    }
    return null
  }

  /** Updates the persisted invalidation policy. Does NOT trigger invalidation. */
  set invalidationPolicy(policy: InvalidationPolicy | ArtifactInvalidationPolicy) {
    this._invalidationPolicy = isInvalidationPolicy(policy)
      ? policy
      : fromLegacyInvalidationPolicy(policy)
  }

  /**
   * Activates implementation tracking for this change.
   *
   * If tracking is already active, this call is idempotent and preserves the
   * existing `implementationTrackingStartedAt` timestamp.
   *
   * @param at - The timestamp to record as the start baseline (defaults to now)
   */
  startImplementationTracking(at: Date = new Date()): void {
    if (this._implementationTrackingStartedAt === null) {
      this._implementationTrackingStartedAt = new Date(at.getTime())
      this.touchUpdatedAt(at)
    }
  }

  /**
   * Tracks or updates one raw implementation file under review.
   *
   * @param file - Raw project-relative file path
   * @param state - Review state to persist
   */
  trackImplementationFile(file: string, state: TrackedImplementationFileState = 'open'): void {
    this._assertImplementationFile(file)
    this._trackedImplementationFiles.set(file, state)
  }

  /**
   * Removes one tracked implementation file.
   *
   * @param file - Raw project-relative file path
   */
  untrackImplementationFile(file: string): void {
    this._trackedImplementationFiles.delete(file)
  }

  /**
   * Creates or enriches one confirmed implementation link.
   *
   * Re-adding the same `spec + file` set enriches the existing link rather than
   * creating a duplicate peer entry.
   *
   * @param link - Link data to create or merge
   */
  addImplementationLink(link: ImplementationLink): void {
    this._assertImplementationLink(link)
    const key = implementationLinkKey(link.specId, link.file)
    const existing = this._implementationLinks.get(key)
    if (existing === undefined) {
      this._setImplementationLink(link)
      return
    }

    const mergedSymbols = new Set<string>(existing.symbols ?? [])
    for (const symbol of link.symbols ?? []) {
      mergedSymbols.add(symbol)
    }

    this._setImplementationLink({
      specId: existing.specId,
      file: existing.file,
      fileLinkExplicit: existing.fileLinkExplicit || link.fileLinkExplicit,
      ...(mergedSymbols.size > 0 ? { symbols: [...mergedSymbols] } : {}),
    })
  }

  /**
   * Removes an entire confirmed implementation link for one `spec + file` set.
   *
   * @param specId - Canonical spec ID
   * @param file - Raw project-relative file path
   */
  removeImplementationLink(specId: string, file: string): void {
    this._implementationLinks.delete(implementationLinkKey(specId, file))
  }

  /**
   * Removes one symbol refinement from a confirmed implementation link.
   *
   * If the file-level presence only exists as the container for symbol-level
   * links, removing the final symbol removes the whole `spec + file` set.
   *
   * @param specId - Canonical spec ID
   * @param file - Raw project-relative file path
   * @param symbol - Symbol identifier to remove
   */
  removeImplementationSymbol(specId: string, file: string, symbol: string): void {
    const key = implementationLinkKey(specId, file)
    const existing = this._implementationLinks.get(key)
    if (existing === undefined || existing.symbols === undefined) return

    const remaining = existing.symbols.filter((candidate) => candidate !== symbol)
    if (remaining.length === 0) {
      if (existing.fileLinkExplicit) {
        this._setImplementationLink({
          specId,
          file,
          fileLinkExplicit: true,
        })
      } else {
        this._implementationLinks.delete(key)
      }
      return
    }

    this._setImplementationLink({
      specId,
      file,
      fileLinkExplicit: existing.fileLinkExplicit,
      symbols: remaining,
    })
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

  /**
   * Persists one implementation link after invariant checks and normalization.
   *
   * @param link - The link to persist
   */
  private _setImplementationLink(link: ImplementationLink): void {
    this._assertImplementationLink(link)
    this._implementationLinks.set(implementationLinkKey(link.specId, link.file), {
      specId: link.specId,
      file: link.file,
      fileLinkExplicit: link.fileLinkExplicit,
      ...(link.symbols !== undefined ? { symbols: [...new Set(link.symbols)] } : {}),
    })
  }

  /**
   * Validates one tracked implementation file path.
   *
   * @param file - Raw project-relative file path
   * @throws {InvalidChangeError} When the file path is empty
   */
  private _assertImplementationFile(file: string): void {
    if (file.trim().length === 0) {
      throw new InvalidChangeError('tracked implementation file must not be empty')
    }
  }

  /**
   * Validates one implementation link shape before persistence.
   *
   * @param link - Link data to validate
   * @throws {InvalidChangeError} When link invariants are violated
   */
  private _assertImplementationLink(link: ImplementationLink): void {
    if (link.specId.trim().length === 0) {
      throw new InvalidChangeError('implementation link specId must not be empty')
    }
    this._assertImplementationFile(link.file)
    if (!link.fileLinkExplicit && (link.symbols === undefined || link.symbols.length === 0)) {
      throw new InvalidChangeError(
        'container-only implementation links require one or more symbols',
      )
    }
  }

  /** Whether this change is in `archivable` or `archiving` state and may be archived. */
  get isArchivable(): boolean {
    return this.state === 'archivable' || this.state === 'archiving'
  }

  /**
   * Attempts a lifecycle state transition, appending a `transitioned` event.
   *
   * @param to - The target state
   * @param actor - Identity of the actor performing the transition
   * @throws {InvalidStateTransitionError} If the transition is not permitted or is a self-transition
   */
  transition(to: ChangeState, actor: ActorIdentity): void {
    const from = this.state
    if (from === to) {
      throw new InvalidStateTransitionError(from, to)
    }
    if (!isValidTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to)
    }
    const now = new Date()
    this._history.push({ type: 'transitioned', from, to, at: now, by: actor })
    if (to === 'implementing' && this._implementationTrackingStartedAt === null) {
      this._implementationTrackingStartedAt = new Date(now.getTime())
    }
    this.touchUpdatedAt(now)
  }

  /**
   * Applies a lifecycle edge reserved for canonical validity recovery.
   *
   * @param recovery - Evaluator-selected cause and exact source/target states
   * @param actor - Identity attributed to the recovery transition
   * @throws {InvalidStateTransitionError} When the aggregate state or recovery topology does not match
   */
  recover(recovery: AutomaticRecovery, actor: ActorIdentity): void {
    const from = this.state
    const allowedTarget = RECOVERY_ONLY_TRANSITIONS[recovery.cause][from]
    if (from !== recovery.from || allowedTarget !== recovery.to) {
      throw new InvalidStateTransitionError(from, recovery.to)
    }
    const now = new Date()
    this._history.push({ type: 'transitioned', from, to: recovery.to, at: now, by: actor })
    this.touchUpdatedAt(now)
  }

  /**
   * Records an invalidation of change artifacts.
   *
   * Policy semantics:
   * - `none`: no artifact states are reopened; drift is informational only
   * - `surgical`: only the targeted files are reopened
   * - `downstream`: targets + all DAG descendants are reopened
   * - `global`: every artifact/file in the change is reopened
   *
   * Note: Does NOT automatically transition to `designing` or clear approval projections.
   * Lifecycle recovery and gate invalidation are owned by canonical reconciliation.
   *
   * @param cause - The reason for invalidation
   * @param actor - Identity of the actor triggering the change
   * @param message - Human-readable invalidation summary
   * @param affectedArtifacts - Artifact/file payload that triggered the invalidation
   * @param artifactDag - Schema-derived DAG used for `downstream` expansion
   * @param policy - Invalidation policy override
   * @param taskArtifactIds - Set of artifact type IDs that have tasks (excluded from propagation)
   * @returns The final deduplicated affected set after policy expansion
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
    artifactDag: ArtifactDag,
    policy?: InvalidationPolicy | ArtifactInvalidationPolicy,
    taskArtifactIds?: ReadonlySet<string>,
  ): readonly InvalidatedArtifactEntry[] {
    const effectivePolicy = this._resolveInvalidationPolicy(policy)
    const expanded = this._expandAffectedArtifacts(
      affectedArtifacts,
      effectivePolicy,
      artifactDag,
      taskArtifactIds,
    )

    const now = new Date()
    this._history.push({
      type: 'invalidated',
      cause,
      message,
      affectedArtifacts: expanded,
      at: now,
      by: actor,
    })

    if (cause === 'artifact-drift') {
      for (const entry of affectedArtifacts) {
        const artifact = this._artifacts.get(entry.type)
        if (artifact === undefined) continue
        for (const key of entry.files) {
          const file = artifact.getFile(key)
          if (file !== undefined) file.markDrifted()
        }
      }
    }

    const expandedMap = new Map<string, readonly string[]>(
      expanded.map((e) => [e.type, [...e.files]]),
    )

    const artifactPolicy = effectivePolicy.artifacts

    if (artifactPolicy === 'none') return expanded

    if (artifactPolicy === 'surgical') {
      for (const [typeId, keys] of expandedMap) {
        const artifact = this._artifacts.get(typeId)
        if (artifact === undefined) continue
        const driftKeys =
          cause === 'artifact-drift'
            ? (affectedArtifacts.find((a) => a.type === typeId)?.files ?? [])
            : []
        const driftSet = new Set(driftKeys)
        for (const key of keys) {
          if (driftSet.has(key)) {
            artifact.getFile(key)?.markDriftedPendingReview()
          } else {
            artifact.getFile(key)?.markPendingReview()
          }
        }
        artifact.recomputeStatus()
      }
      return expanded
    }

    for (const [typeId, keys] of expandedMap) {
      const artifact = this._artifacts.get(typeId)
      if (artifact === undefined) continue
      const driftKeys =
        cause === 'artifact-drift'
          ? (affectedArtifacts.find((a) => a.type === typeId)?.files ?? [])
          : []
      if (driftKeys.length > 0) {
        artifact.markDriftedPendingReview(driftKeys)
        const remaining = keys.filter((k) => !driftKeys.includes(k))
        if (remaining.length > 0) {
          for (const key of remaining) {
            artifact.getFile(key)?.markPendingReview()
          }
          artifact.recomputeStatus()
        }
      } else {
        artifact.markPendingReview()
      }
    }

    return expanded
  }

  /**
   * Resolves the effective invalidation policy, preferring an explicit override.
   *
   * @param override - Caller-supplied policy override
   * @returns The effective policy
   */
  private _resolveInvalidationPolicy(
    override?: InvalidationPolicy | ArtifactInvalidationPolicy,
  ): InvalidationPolicy {
    if (!override) {
      return this._invalidationPolicy
    }
    return isInvalidationPolicy(override) ? override : fromLegacyInvalidationPolicy(override)
  }

  /**
   * Expands the base affected set according to the invalidation policy.
   *
   * @param base - The initially targeted artifact/file entries
   * @param policy - The effective invalidation policy
   * @param artifactDag - Schema-derived DAG for `downstream` expansion
   * @param taskArtifactIds - Artifact type IDs containing tasks (excluded from propagation)
   * @returns The expanded affected set
   */
  private _expandAffectedArtifacts(
    base: readonly InvalidatedArtifactEntry[],
    policy: InvalidationPolicy,
    artifactDag: ArtifactDag,
    taskArtifactIds?: ReadonlySet<string>,
  ): readonly InvalidatedArtifactEntry[] {
    const artifactPolicy = policy.artifacts

    if (artifactPolicy === 'none' || artifactPolicy === 'surgical') {
      const seen = new Map<string, Set<string>>()
      for (const entry of base) {
        let set = seen.get(entry.type)
        if (set === undefined) {
          set = new Set<string>()
          seen.set(entry.type, set)
        }
        for (const f of entry.files) set.add(f)
      }
      return [...seen.entries()].map(([type, files]) => ({ type, files: [...files] }))
    }

    if (artifactPolicy === 'global') {
      const baseTypes = new Set(base.map((e) => e.type))
      return [...this._artifacts.values()]
        .filter((artifact) => {
          if (baseTypes.has(artifact.type)) return true
          return taskArtifactIds ? !taskArtifactIds.has(artifact.type) : true
        })
        .map((artifact) => ({
          type: artifact.type,
          files: [...artifact.files.keys()],
        }))
    }

    // downstream: targets + DAG descendants
    const baseTypes = new Set(base.map((e) => e.type))
    const descendants = artifactDag.descendantsOf([...baseTypes])

    const seen = new Map<string, Set<string>>()
    for (const entry of base) {
      let set = seen.get(entry.type)
      if (set === undefined) {
        set = new Set<string>()
        seen.set(entry.type, set)
      }
      for (const f of entry.files) set.add(f)
    }
    for (const typeId of descendants) {
      if (taskArtifactIds && taskArtifactIds.has(typeId) && !baseTypes.has(typeId)) {
        continue
      }
      if (!seen.has(typeId)) {
        const artifact = this._artifacts.get(typeId)
        if (artifact !== undefined) {
          seen.set(typeId, new Set(artifact.files.keys()))
        }
      }
    }

    return [...seen.entries()].map(([type, files]) => ({ type, files: [...files] }))
  }

  /**
   * Records that the spec approval gate has been passed, renewing the spec approval projection.
   *
   * @param reason - Free-text rationale for the approval
   * @param fingerprint - Complete scope-aware approval fingerprint
   * @param actor - Identity of the approver
   * @param at - Timestamp (defaults to now)
   */
  recordSpecApproval(
    reason: string,
    fingerprint: SpecApprovalFingerprint,
    actor: ActorIdentity,
    at: Date = new Date(),
  ): void {
    this._specApproval = {
      status: 'valid',
      decision: { at, by: actor, reason },
      fingerprint,
    }

    this._history.push({
      type: 'spec-approved',
      reason,
      artifactHashes: { ...fingerprint.artifacts.files },
      fingerprint,
      at,
      by: actor,
    })
    this.touchUpdatedAt(at)
  }

  /**
   * Records that the signoff gate has been passed, renewing the signoff projection.
   *
   * @param reason - Free-text rationale for the sign-off
   * @param fingerprint - Materialized signoff fingerprint or legacy artifact hashes record
   * @param actorOrVerificationId - Actor identity (if 3-arg legacy call) or verification ID string
   * @param actor - Identity of the approver (when verificationId is passed)
   * @param at - Timestamp (defaults to now)
   * @throws {Error} When a verification id is passed without an actor
   */
  recordSignoff(
    reason: string,
    fingerprint: SignoffProjection['fingerprint'] | Record<string, string>,
    actorOrVerificationId: ActorIdentity | string,
    actor?: ActorIdentity,
    at: Date = new Date(),
  ): void {
    let verificationId: string | null = null
    let actualActor: ActorIdentity

    if (typeof actorOrVerificationId === 'string') {
      verificationId = actorOrVerificationId
      if (!actor) {
        throw new Error('Actor must be supplied when verificationId is provided')
      }
      actualActor = actor
    } else {
      actualActor = actorOrVerificationId
    }

    const signoffFp: SignoffProjection['fingerprint'] = isSignoffFingerprint(fingerprint)
      ? fingerprint
      : {
          version: 1,
          artifacts: coerceArtifactFingerprint(fingerprint),
          implementation: null,
        }

    this._signoff = {
      status: 'valid',
      decision: { at, by: actualActor, reason },
      fingerprint: signoffFp,
      verificationId,
    }

    this._history.push({
      type: 'signed-off',
      reason,
      artifactHashes: { ...signoffFp.artifacts.files },
      at,
      by: actualActor,
    })
    this.touchUpdatedAt(at)
  }

  /**
   * Marks a projection (spec or signoff) stale or revoked.
   *
   * @param gate - Which gate to invalidate (`'spec'` or `'signoff'`)
   * @param status - The target status (`'stale'` or `'revoked'`)
   * @param invalidation - Details of the invalidation
   * @returns `true` if the status changed; `false` if already in the same or stronger status
   */
  markApprovalInvalid(
    gate: 'spec' | 'signoff',
    status: 'stale' | 'revoked',
    invalidation: ProjectionInvalidation,
  ): boolean {
    if (gate === 'spec') {
      if (this._specApproval === undefined) {
        return false
      }
      if (this._specApproval.status === 'revoked') {
        return false
      }
      if (this._specApproval.status === 'stale' && status === 'stale') {
        return false
      }
      this._specApproval = {
        ...this._specApproval,
        status,
        invalidation,
      }
      this._history.push({
        type: 'approval-invalidated',
        gate: 'spec',
        status,
        cause: invalidation.cause,
        reason: invalidation.reason,
        differences: invalidation.differences,
        at: invalidation.at,
        by: invalidation.by,
      })
      this.touchUpdatedAt(invalidation.at)
      return true
    }

    if (gate === 'signoff') {
      if (this._signoff === undefined) {
        return false
      }
      if (this._signoff.status === 'revoked') {
        return false
      }
      if (this._signoff.status === 'stale' && status === 'stale') {
        return false
      }
      this._signoff = {
        ...this._signoff,
        status,
        invalidation,
      }
      this._history.push({
        type: 'approval-invalidated',
        gate: 'signoff',
        status,
        cause: invalidation.cause,
        reason: invalidation.reason,
        differences: invalidation.differences,
        at: invalidation.at,
        by: invalidation.by,
      })
      this.touchUpdatedAt(invalidation.at)
      return true
    }

    return false
  }

  /**
   * Starts a verification attempt with the given baseline.
   *
   * @param baseline - Combined validity fingerprint baseline
   * @param actor - Identity of the actor starting verification
   * @param at - Optional start timestamp
   * @returns Object containing the created attempt and superseded attempt ID if any
   */
  startVerification(
    baseline: ValidityFingerprint,
    actor: ActorIdentity,
    at: Date = new Date(),
  ): { readonly attempt: VerificationAttempt; readonly supersededAttemptId: string | null } {
    let attemptCount = 0
    for (const evt of this._history) {
      if (evt.type === 'verification-attempt-started') {
        attemptCount++
      }
    }
    const attemptId = `verification-attempt-${attemptCount + 1}`
    const supersededAttemptId = this._verification.activeAttempt?.id ?? null

    const attempt: VerificationAttempt = {
      id: attemptId,
      startedAt: at,
      startedBy: actor,
      startedIn: this.state,
      baseline,
    }

    this._verification = {
      ...this._verification,
      activeAttempt: attempt,
    }

    this._history.push({
      type: 'verification-attempt-started',
      at,
      by: actor,
      attemptId,
      state: this.state,
      fingerprintVersion: 1,
      artifactAlgorithm: baseline.artifacts.algorithm,
      textNormalization: baseline.implementation.textNormalization,
      binaryNormalization: baseline.implementation.binaryNormalization,
    })
    this.touchUpdatedAt(at)

    return { attempt, supersededAttemptId }
  }

  /**
   * Completes the currently active verification attempt, recording successful completed evidence.
   *
   * @param actor - Identity of the actor completing verification
   * @param at - Optional completion timestamp
   * @returns Completed verification evidence
   * @throws {Error} If no active verification attempt exists
   */
  completeVerification(actor: ActorIdentity, at: Date = new Date()): CompletedVerification {
    const active = this._verification.activeAttempt
    if (!active) {
      throw new Error('No active verification attempt to complete')
    }

    const ordinal = active.id.replace('verification-attempt-', '')
    const verificationId = `verification-${ordinal}`

    const completed: CompletedVerification = {
      id: verificationId,
      attemptId: active.id,
      status: 'valid',
      completedAt: at,
      completedBy: actor,
      fingerprint: {
        version: 1,
        artifacts: active.baseline.artifacts,
        implementation: active.baseline.implementation,
      },
    }

    this._verification = {
      completed,
    }

    this._history.push({
      type: 'verification-completed',
      at,
      by: actor,
      attemptId: active.id,
      verificationId,
    })
    this.touchUpdatedAt(at)

    return completed
  }

  /**
   * Explicitly marks completed verification evidence as stale.
   *
   * @param invalidation - Invalidation metadata
   * @returns `true` if evidence changed from valid to stale; `false` if already stale or absent
   */
  invalidateVerification(invalidation: ProjectionInvalidation): boolean {
    const completed = this._verification.completed
    if (!completed) {
      return false
    }
    if (completed.status === 'stale') {
      return false
    }

    this._verification = {
      ...this._verification,
      completed: {
        ...completed,
        status: 'stale',
        invalidation,
      },
    }

    this._history.push({
      type: 'verification-invalidated',
      at: invalidation.at,
      by: invalidation.by,
      verificationId: completed.id,
      reason: invalidation.reason,
    })
    this.touchUpdatedAt(invalidation.at)

    return true
  }

  /**
   * Clears an active signoff without redesign, artifact downgrade, or spec-approval invalidation.
   *
   * Used for skill-aligned hops from `done` / `signed-off` / `archivable` back to
   * `implementing` or `verifying`. A subsequent forward move toward `archivable`
   * requires signoff again when that gate is enabled.
   *
   * @param actor - Identity of the actor clearing signoff
   * @param reason - Optional explanation for clearing signoff
   */
  invalidateSignoff(actor: ActorIdentity, reason = 'Signoff cleared'): void {
    if (this._signoff?.status === 'valid') {
      this._signoff = {
        ...this._signoff,
        status: 'revoked',
        invalidation: {
          at: new Date(),
          by: actor,
          cause: 'manual-invalidation',
          reason,
          differences: [],
        },
      }
      this._history.push({ type: 'signoff-invalidated', at: new Date(), by: actor })
      this.touchUpdatedAt()
    } else if (this.activeSignoff !== undefined) {
      this._history.push({ type: 'signoff-invalidated', at: new Date(), by: actor })
      this.touchUpdatedAt()
    }
  }

  /**
   * Records a failed archive attempt without implying archive completion.
   *
   * @param step - The archive phase that failed
   * @param message - Human-readable failure summary
   * @param actor - Identity of the actor attempting the archive
   * @param commitStarted - Whether permanent archive commit had already begun
   */
  recordArchiveFailure(
    step: ArchiveFailureStep,
    message: string,
    actor: ActorIdentity,
    commitStarted: boolean,
  ): void {
    this._history.push({
      type: 'archive-failed',
      at: new Date(),
      by: actor,
      step,
      message,
      commitStarted,
    })
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
   * @param artifactDag - Schema-derived DAG for invalidation expansion
   */
  /**
   * Replaces spec ids without opening artifact review.
   *
   * Validity consequences belong to reconciliation. This method only updates
   * the scope set and drops dependency entries for removed specs.
   *
   * @param specIds - Replacement spec identifiers
   */
  replaceSpecIds(specIds: readonly string[]): void {
    this._specIds = [...new Set(specIds)]
    const newIds = new Set(this._specIds)
    for (const key of this._specDependsOn.keys()) {
      if (!newIds.has(key)) this._specDependsOn.delete(key)
    }
  }

  /**
   * Update spec ids.
   *
   * @param specIds - spec ids
   * @param actor - actor
   * @param artifactDag - artifact dag
   */
  updateSpecIds(specIds: readonly string[], actor: ActorIdentity, artifactDag: ArtifactDag): void {
    this.replaceSpecIds(specIds)
    this.invalidate(
      'spec-change',
      actor,
      'Invalidated because the change scope changed and artifacts require review.',
      [...this._artifacts.values()].map((artifact) => ({
        type: artifact.type,
        files: [...artifact.files.keys()],
      })),
      artifactDag,
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
   * Asserts that this change is in `archivable` or `archiving` state.
   *
   * @throws {InvalidStateTransitionError} If the change is not in `archivable` or `archiving` state
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
   * - For `scope: 'change'`: ensures one `ArtifactFile` keyed by the type id
   * - For `scope: 'spec'`: ensures one `ArtifactFile` per specId
   * - Removes files for specIds no longer in the change
   * - Removes artifacts for types no longer in the schema
   * - Preserves existing `validatedHash` and `state` for surviving entries,
   *   including filename normalization
   *
   * If the sync produces any changes, an `artifacts-synced` event is appended
   * to the history.
   *
   * Pure method with no I/O. Called by the repository layer on every `get()`
   * and `save()` to keep the artifact map in sync with schema x specIds.
   *
   * @param artifactTypes - The resolved artifact types from the active schema
   * @param specExistence - Optional precomputed spec-existence map by specId
   * @returns `true` if any changes were made, `false` if the artifact map was already in sync
   */
  syncArtifacts(
    artifactTypes: readonly ArtifactType[],
    specExistence?: ReadonlyMap<string, boolean>,
  ): boolean {
    const typeIds = new Set(artifactTypes.map((t) => t.id))
    const typesAdded: string[] = []
    const typesRemoved: string[] = []
    const filesAdded: Array<{ type: string; key: string }> = []
    const filesRemoved: Array<{ type: string; key: string }> = []
    let filesRenamed = false

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

      if (artifactType.scope === 'change') {
        // One file keyed by type id
        if (artifact.getFile(artifactType.id) === undefined) {
          artifact.setFile(
            new ArtifactFile({
              key: artifactType.id,
              filename: expectedArtifactFilename({
                artifactType,
                key: artifactType.id,
              }),
            }),
          )
          filesAdded.push({ type: artifactType.id, key: artifactType.id })
        }
      } else {
        // scope: 'spec' — one file per specId

        // Add files for new specIds
        for (const specId of this._specIds) {
          if (artifact.getFile(specId) === undefined) {
            const specExists = specExistence?.get(specId)
            artifact.setFile(
              new ArtifactFile({
                key: specId,
                filename: expectedArtifactFilename({
                  artifactType,
                  key: specId,
                  ...(specExists !== undefined ? { specExists } : {}),
                }),
              }),
            )
            filesAdded.push({ type: artifactType.id, key: specId })
          } else if (specExistence !== undefined) {
            const existing = artifact.getFile(specId)
            if (existing !== undefined) {
              const specExists = specExistence.get(specId)
              const expectedFilename = expectedArtifactFilename({
                artifactType,
                key: specId,
                ...(specExists !== undefined ? { specExists } : {}),
              })
              if (
                existing.filename !== expectedFilename &&
                (artifactRepresentationClass(existing.filename) ===
                  artifactRepresentationClass(expectedFilename) ||
                  existing.validatedHash === undefined)
              ) {
                artifact.setFile(
                  new ArtifactFile({
                    key: existing.key,
                    filename: expectedFilename,
                    status: existing.status,
                    ...(existing.validatedHash !== undefined
                      ? { validatedHash: existing.validatedHash }
                      : {}),
                  }),
                )
                filesRenamed = true
              }
            }
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
      filesRemoved.length > 0 ||
      filesRenamed

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

/**
 * Builds the stable map key for one confirmed implementation link.
 *
 * @param specId - Canonical spec ID
 * @param file - Raw project-relative file path
 * @returns Stable string key for the `spec + file` set
 */
function implementationLinkKey(specId: string, file: string): string {
  return `${specId}\u0000${file}`
}

/**
 * Returns the tracked representation class for a change artifact filename.
 *
 * @param filename - The tracked change-directory filename
 * @returns `delta` for `deltas/...` files, otherwise `direct`
 */
function artifactRepresentationClass(filename: string): 'delta' | 'direct' {
  return filename.startsWith('deltas/') ? 'delta' : 'direct'
}

/**
 * Accepts a materialized artifact fingerprint or a legacy hash map.
 *
 * @param fingerprint - Structured fingerprint or pre-hash file map
 * @returns Artifact fingerprint version 1
 */
function coerceArtifactFingerprint(
  fingerprint: ArtifactFingerprint | Record<string, string>,
): ArtifactFingerprint {
  if (isArtifactFingerprint(fingerprint)) return fingerprint
  const files: Record<string, Sha256Digest> = {}
  for (const [key, digest] of Object.entries(fingerprint)) {
    files[key] = digest as Sha256Digest
  }
  return { version: 1, algorithm: 'artifact-pre-hash-v1', files }
}

/**
 * Distinguishes a structured artifact fingerprint from a legacy hash map.
 *
 * @param value - Caller-supplied fingerprint
 * @returns `true` when the value already carries version, algorithm, and files
 */
function isArtifactFingerprint(
  value: ArtifactFingerprint | Record<string, string>,
): value is ArtifactFingerprint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'algorithm' in value &&
    'files' in value &&
    typeof value.files === 'object'
  )
}

/**
 * Distinguishes a sign-off fingerprint from a legacy artifact hash map.
 *
 * @param value - Caller-supplied sign-off fingerprint
 * @returns `true` when artifacts and implementation slots are present
 */
function isSignoffFingerprint(
  value: SignoffProjection['fingerprint'] | Record<string, string>,
): value is SignoffProjection['fingerprint'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    'artifacts' in value &&
    'implementation' in value &&
    typeof value.artifacts === 'object'
  )
}
