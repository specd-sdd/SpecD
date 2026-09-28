import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import { type ValidityFingerprintService } from '../services/validity-fingerprint-service.js'
import {
  SYSTEM_ACTOR,
  type ActorIdentity,
  type Change,
  type ProjectionInvalidation,
  type ValidityInvalidationCause,
} from '../../domain/entities/change.js'
import {
  evaluateChangeValidity,
  selectAutomaticRecovery,
  type ArtifactReviewTarget,
  type AutomaticRecovery,
  type ChangeValidityFacts,
  type ChangeValidityVerdict,
  type ProjectionChange,
} from '../../domain/services/change-validity.js'
import { type InvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import {
  canonicalSpecIds,
  type SpecApprovalFingerprint,
  type ValidityFingerprint,
} from '../../domain/value-objects/validity-fingerprint.js'
import { type ArtifactDag } from '../../domain/value-objects/artifact-dag.js'

/** Why a reconciliation pass is running. Omission means observation only. */
export type ReconciliationIntent =
  | { readonly type: 'observe' }
  | {
      readonly type: 'manual-invalidation'
      readonly reason: string
      readonly policy: InvalidationPolicy
      readonly targets: readonly ArtifactReviewTarget[]
      readonly revoke: readonly ('spec' | 'signoff')[]
    }
  | { readonly type: 'verification-invalidation'; readonly reason: string }
  | { readonly type: 'scope-change'; readonly reason: string }
  | {
      readonly type: 'spec-overlap-conflict'
      readonly reason: string
      readonly targets: readonly ArtifactReviewTarget[]
    }

/** Input for one reconciliation pass. */
export interface ReconcileChangeValidityInput {
  readonly name: string
  readonly intent?: ReconciliationIntent
  readonly refreshImplementationTracking?: boolean
  /** Already privacy-decorated operation actor; avoids a second identity resolution. */
  readonly actor?: ActorIdentity
}

/** Committed result of reconciliation. */
export interface ReconcileChangeValidityResult {
  readonly change: Change
  readonly verdict: ChangeValidityVerdict
  readonly projectionChanges: readonly ProjectionChange[]
  readonly affectedArtifacts: readonly ArtifactReviewTarget[]
  readonly automaticReturn: AutomaticRecovery | null
  readonly changed: boolean
}

/** Dependencies for the canonical validity reconciler. */
export interface ReconcileChangeValidityDeps {
  readonly changes: ChangeRepository
  readonly schemaProvider: SchemaProvider
  readonly actor: ActorResolver
  readonly refreshImplementationTracking: RefreshImplementationTracking
  readonly fingerprint: ValidityFingerprintService
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
}

/** Facts visible to a caller operation inside a reconciled mutation. */
export interface ReconciledMutationContext {
  readonly change: Change
  readonly before: ChangeValidityVerdict
  readonly fingerprint: ValidityFingerprint | null
  reconcileAfter(intent?: ReconciliationIntent): Promise<ChangeValidityVerdict>
}

/** Result of a caller operation wrapped by reconciled mutation. */
export interface ReconciledMutationResult<T> extends ReconcileChangeValidityResult {
  readonly result: T
}

/** Applied reconciliation. */
interface AppliedReconciliation {
  readonly verdict: ChangeValidityVerdict
  readonly fingerprint: ValidityFingerprint | null
  readonly changed: boolean
}

/**
 * Sole owner of artifact review, projection invalidation, audit, and automatic recovery.
 *
 * `execute` commits that result before the caller attempts a later operation, so a
 * subsequent check failure cannot roll the recovery back. `mutate` keeps pre- and
 * post-evaluation inside one serialized callback for operations that must not hide drift.
 */
export class ReconcileChangeValidity {
  private readonly _deps: ReconcileChangeValidityDeps

  /**
   * Creates the reconciler.
   *
   * @param deps - Repository, schema, actor, tracking refresh, fingerprint, and gates
   */
  constructor(deps: ReconcileChangeValidityDeps) {
    this._deps = deps
  }

  /**
   * Collects fresh facts, applies only new consequences, and persists them atomically.
   *
   * @param input - Change name, optional intent, and tracking refresh flag
   * @returns The committed aggregate and verdict
   * @throws {ChangeNotFoundError} When the change does not exist
   */
  async execute(input: ReconcileChangeValidityInput): Promise<ReconcileChangeValidityResult> {
    await this._refresh(input)
    const actor = input.actor ?? (await this._actor(input.intent))
    const { result, change } = await this._deps.changes.mutate(input.name, async (fresh) => {
      return this._apply(fresh, input.intent ?? { type: 'observe' }, actor)
    })
    return this._toResult(change, result)
  }

  /**
   * Evaluates validity, runs a caller operation, then evaluates again in one mutation.
   *
   * @param input - Change name and the intent used for the pre-pass
   * @param operation - Mutation that must not call invalidators itself
   * @returns The post-operation committed verdict plus the operation result
   */
  async mutate<T>(
    input: ReconcileChangeValidityInput,
    operation: (context: ReconciledMutationContext) => Promise<T> | T,
  ): Promise<ReconciledMutationResult<T>> {
    await this._refresh(input)
    const actor = input.actor ?? (await this._deps.actor.identity())
    const { result, change } = await this._deps.changes.mutate(input.name, async (fresh) => {
      const before = await this._apply(fresh, input.intent ?? { type: 'observe' }, actor)
      let after = before
      const operationResult = await operation({
        change: fresh,
        before: before.verdict,
        fingerprint: before.fingerprint,
        reconcileAfter: async (intent) => {
          after = await this._apply(fresh, intent ?? { type: 'observe' }, actor)
          return after.verdict
        },
      })
      if (after === before) {
        after = await this._apply(fresh, { type: 'observe' }, actor)
      }
      return { applied: after, operationResult }
    })
    return { ...this._toResult(change, result.applied), result: result.operationResult }
  }

  /**
   *  refresh.
   *
   * @param input - input
   * @returns  refresh result
   */
  private async _refresh(input: ReconcileChangeValidityInput): Promise<void> {
    if (input.refreshImplementationTracking !== true) return
    await this._deps.refreshImplementationTracking.execute({ name: input.name })
  }

  /**
   * Resolves the actor once when the operation has no supplied decorated identity.
   *
   * Read-only/system observation keeps the existing system-actor convention;
   * human intents resolve through the configured privacy-decorated resolver.
   *
   * @param intent - Optional reconciliation intent
   * @returns Operation actor
   */
  private async _actor(intent: ReconciliationIntent | undefined): Promise<ActorIdentity> {
    if (intent === undefined || intent.type === 'observe') return SYSTEM_ACTOR
    return this._deps.actor.identity()
  }

  /**
   *  apply.
   *
   * @param change - change
   * @param intent - intent
   * @param actor - actor
   * @returns  apply result
   */
  private async _apply(
    change: Change,
    intent: ReconciliationIntent,
    actor: ActorIdentity,
  ): Promise<AppliedReconciliation> {
    const schema = await this._deps.schemaProvider.get()
    const taskArtifacts = new Set(
      schema.artifacts().flatMap((artifact) => (artifact.hasTasks ? [artifact.id] : [])),
    )
    const collected = await this._deps.fingerprint.completeFingerprint(change)
    const approvalFingerprint: SpecApprovalFingerprint | null =
      collected.fingerprint === null
        ? null
        : {
            version: 1,
            specIds: canonicalSpecIds(change.specIds),
            artifacts: collected.fingerprint.artifacts,
          }
    const policy = intent.type === 'manual-invalidation' ? intent.policy : change.invalidationPolicy
    const direct = collectReviewTargets(change, collected.fingerprint, taskArtifacts)
    const verificationIsRequired = verificationRequired(change)
    const facts: ChangeValidityFacts = {
      currentFingerprint: collected.fingerprint,
      currentSpecApprovalFingerprint: approvalFingerprint,
      fingerprintFailures: collected.failures,
      driftedArtifacts: mergeTargets(direct.drifted, intentTargetsOf(intent)),
      pendingReviewArtifacts: direct.pending,
      taskArtifacts,
      approvalsRequired: this._deps.approvals,
      verificationRequired: verificationIsRequired,
    }
    const evaluated = evaluateChangeValidity(change, facts, policy)
    const withIntent = applyIntent(change, evaluated, intent, policy, verificationIsRequired)
    const verdict: ChangeValidityVerdict = {
      ...withIntent,
      affectedArtifacts: expandAffected(
        withIntent.affectedArtifacts,
        policy,
        schema.artifactDag(),
        taskArtifacts,
        change,
      ),
    }
    const changed = persistConsequences(
      change,
      verdict,
      intent,
      actor,
      schema.artifactDag(),
      taskArtifacts,
    )
    return { verdict, fingerprint: collected.fingerprint, changed }
  }

  /**
   *  to result.
   *
   * @param change - change
   * @param applied - applied
   * @returns  to result result
   */
  private _toResult(change: Change, applied: AppliedReconciliation): ReconcileChangeValidityResult {
    return {
      change,
      verdict: applied.verdict,
      projectionChanges: applied.verdict.projectionChanges,
      affectedArtifacts: applied.verdict.affectedArtifacts,
      automaticReturn: applied.verdict.recovery,
      changed: applied.changed,
    }
  }
}

/**
 * Verification required.
 *
 * @param change - change
 * @returns verification required result
 */
function verificationRequired(change: Change): boolean {
  return (
    change.state === 'verifying' ||
    change.state === 'done' ||
    change.state === 'archivable' ||
    change.state === 'archiving' ||
    change.state === 'pending-signoff' ||
    change.state === 'signed-off'
  )
}

/**
 * Collect review targets.
 *
 * @param change - change
 * @param fingerprint - fingerprint
 * @param taskArtifacts - task artifacts
 * @returns drifted and pending artifact review targets
 */
function collectReviewTargets(
  change: Change,
  fingerprint: ValidityFingerprint | null,
  taskArtifacts: ReadonlySet<string>,
): { readonly drifted: ArtifactReviewTarget[]; readonly pending: ArtifactReviewTarget[] } {
  const drifted: ArtifactReviewTarget[] = []
  const pending: ArtifactReviewTarget[] = []
  for (const [typeId, artifact] of change.artifacts) {
    if (taskArtifacts.has(typeId)) continue
    for (const file of artifact.files.values()) {
      if (file.status === 'skipped') continue
      const hash = fingerprint?.artifacts.files[`${typeId}:${file.key}`]
      const hashDrift =
        file.validatedHash !== undefined && hash !== undefined && hash !== file.validatedHash
      if (file.hasDrift || hashDrift) {
        drifted.push({
          artifactId: typeId,
          fileKey: file.key,
          filename: file.filename,
          origin: 'drift',
        })
        continue
      }
      if (file.status === 'pending-review') {
        pending.push({
          artifactId: typeId,
          fileKey: file.key,
          filename: file.filename,
          origin: 'direct',
        })
      }
    }
  }
  return { drifted, pending }
}

/**
 * Expand affected.
 *
 * @param affected - affected
 * @param policy - policy
 * @param dag - dag
 * @param taskArtifacts - task artifacts
 * @param change - change
 * @returns expand affected result
 */
function expandAffected(
  affected: readonly ArtifactReviewTarget[],
  policy: InvalidationPolicy,
  dag: ArtifactDag,
  taskArtifacts: ReadonlySet<string>,
  change: Change,
): ArtifactReviewTarget[] {
  if (affected.length === 0 || policy.artifacts === 'none' || policy.artifacts === 'surgical') {
    return [...affected]
  }
  if (policy.artifacts === 'global') {
    return mergeTargets(affected, allNonTask(change, taskArtifacts, 'global'))
  }
  const descendants = new Set(dag.descendantsOf(affected.map((target) => target.artifactId)))
  const expanded = [...affected]
  for (const [typeId, artifact] of change.artifacts) {
    if (!descendants.has(typeId) || taskArtifacts.has(typeId)) continue
    for (const file of artifact.files.values()) {
      if (file.status === 'skipped') continue
      expanded.push({
        artifactId: typeId,
        fileKey: file.key,
        filename: file.filename,
        origin: 'downstream',
      })
    }
  }
  return mergeTargets([], expanded)
}

/**
 * All non task.
 *
 * @param change - change
 * @param taskArtifacts - task artifacts
 * @param origin - origin
 * @returns all non task result
 */
function allNonTask(
  change: Change,
  taskArtifacts: ReadonlySet<string>,
  origin: ArtifactReviewTarget['origin'],
): ArtifactReviewTarget[] {
  const targets: ArtifactReviewTarget[] = []
  for (const [typeId, artifact] of change.artifacts) {
    if (taskArtifacts.has(typeId)) continue
    for (const file of artifact.files.values()) {
      if (file.status === 'skipped') continue
      targets.push({ artifactId: typeId, fileKey: file.key, filename: file.filename, origin })
    }
  }
  return targets
}

/**
 * Intent targets of.
 *
 * @param intent - intent
 * @returns intent targets of result
 */
function intentTargetsOf(intent: ReconciliationIntent): readonly ArtifactReviewTarget[] {
  if (intent.type === 'manual-invalidation' || intent.type === 'spec-overlap-conflict') {
    return intent.targets
  }
  return []
}

/**
 * Merge targets.
 *
 * @param base - base
 * @param extra - extra
 * @returns merge targets result
 */
function mergeTargets(
  base: readonly ArtifactReviewTarget[],
  extra: readonly ArtifactReviewTarget[],
): ArtifactReviewTarget[] {
  const seen = new Set(base.map((target) => `${target.artifactId}:${target.fileKey}`))
  const merged = [...base]
  for (const target of extra) {
    const id = `${target.artifactId}:${target.fileKey}`
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(target)
  }
  return merged
}

/**
 * Apply intent.
 *
 * @param change - change
 * @param verdict - verdict
 * @param intent - intent
 * @param policy - policy
 * @param verificationIsRequired - verification is required
 * @returns apply intent result
 */
function applyIntent(
  change: Change,
  verdict: ChangeValidityVerdict,
  intent: ReconciliationIntent,
  policy: InvalidationPolicy,
  verificationIsRequired: boolean,
): ChangeValidityVerdict {
  const projectionChanges = [...verdict.projectionChanges]
  if (intent.type === 'manual-invalidation') {
    for (const gate of intent.revoke) {
      pushRevocation(change, projectionChanges, gate)
    }
  }
  if (intent.type === 'verification-invalidation') {
    pushVerificationStale(change, projectionChanges, 'verification-invalidated')
    pushStaleGate(change, projectionChanges, 'signoff', 'verification-invalidated')
  }
  if (intent.type === 'spec-overlap-conflict') {
    pushStaleGate(change, projectionChanges, 'spec', 'spec-overlap-conflict')
  }
  // A scope edit is not itself proof that consent changed. The fingerprint
  // comparison above owns that decision so reorder-only edits remain valid.
  const specApproval = fieldAfter(verdict.specApproval, projectionChanges, 'specApproval')
  const signoff = fieldAfter(verdict.signoff, projectionChanges, 'signoff')
  const verification = verificationAfter(verdict.verification, projectionChanges)
  const blockers = [...verdict.blockers]
  if (
    verificationIsRequired &&
    verification === 'stale' &&
    !blockers.some((blocker) => blocker.code === 'VERIFICATION_STALE')
  ) {
    blockers.push({
      code: 'VERIFICATION_STALE',
      message: 'Verification is stale',
      details: { command: 'specd changes verification start <name>' },
    })
  }
  return {
    ...verdict,
    projectionChanges,
    specApproval,
    signoff,
    verification,
    blockers,
    recovery: selectAutomaticRecovery(
      change.state,
      policy,
      specApproval,
      signoff,
      verdict.artifactReviewRequired,
    ),
  }
}

/**
 * Push revocation.
 *
 * @param change - change
 * @param changes - changes
 * @param gate - gate
 */
function pushRevocation(
  change: Change,
  changes: ProjectionChange[],
  gate: 'spec' | 'signoff',
): void {
  const current = gate === 'spec' ? change.specApproval : change.signoff
  if (current === undefined || current.status === 'revoked') return
  const projection = gate === 'spec' ? 'specApproval' : 'signoff'
  const existing = changes.find((changeItem) => changeItem.projection === projection)
  const next: ProjectionChange = {
    projection,
    from: current.status,
    to: 'revoked',
    cause: 'manual-invalidation',
    differences: existing?.differences ?? [],
  }
  if (existing !== undefined) {
    const index = changes.indexOf(existing)
    changes.splice(index, 1, next)
  } else {
    changes.push(next)
  }
}

/**
 * Push stale gate.
 *
 * @param change - change
 * @param changes - changes
 * @param gate - gate
 * @param cause - cause
 */
function pushStaleGate(
  change: Change,
  changes: ProjectionChange[],
  gate: 'spec' | 'signoff',
  cause: ValidityInvalidationCause,
): void {
  const current = gate === 'spec' ? change.specApproval : change.signoff
  if (current === undefined || current.status !== 'valid') return
  const projection = gate === 'spec' ? 'specApproval' : 'signoff'
  if (changes.some((item) => item.projection === projection)) return
  changes.push({ projection, from: 'valid', to: 'stale', cause, differences: [] })
}

/**
 * Push verification stale.
 *
 * @param change - change
 * @param changes - changes
 * @param cause - cause
 */
function pushVerificationStale(
  change: Change,
  changes: ProjectionChange[],
  cause: ValidityInvalidationCause,
): void {
  const completed = change.verification.completed
  if (completed === undefined || completed.status !== 'valid') return
  if (changes.some((item) => item.projection === 'verification')) return
  changes.push({ projection: 'verification', from: 'valid', to: 'stale', cause, differences: [] })
}

/**
 * Field after.
 *
 * @param current - current
 * @param changes - changes
 * @param projection - projection
 * @returns field after result
 */
function fieldAfter(
  current: ChangeValidityVerdict['specApproval'],
  changes: readonly ProjectionChange[],
  projection: 'specApproval' | 'signoff',
): ChangeValidityVerdict['specApproval'] {
  const next = changes.find((item) => item.projection === projection)
  if (next === undefined) return current
  if (current === 'not-required') return current
  return next.to === 'absent' ? 'absent' : next.to
}

/**
 * Verification after.
 *
 * @param current - current
 * @param changes - changes
 * @returns verification after result
 */
function verificationAfter(
  current: ChangeValidityVerdict['verification'],
  changes: readonly ProjectionChange[],
): ChangeValidityVerdict['verification'] {
  if (changes.some((item) => item.projection === 'verification' && item.to === 'stale'))
    return 'stale'
  return current
}

/**
 * Persist consequences.
 *
 * @param change - change
 * @param verdict - verdict
 * @param intent - intent
 * @param actor - actor
 * @param dag - dag
 * @param taskArtifacts - task artifacts
 * @returns persist consequences result
 */
function persistConsequences(
  change: Change,
  verdict: ChangeValidityVerdict,
  intent: ReconciliationIntent,
  actor: ActorIdentity,
  dag: ArtifactDag,
  taskArtifacts: ReadonlySet<string>,
): boolean {
  const at = new Date()
  let changed = false
  for (const projection of verdict.projectionChanges) {
    const invalidation: ProjectionInvalidation = {
      at,
      by: actor,
      cause: projection.cause,
      reason: reasonFor(intent, projection.cause),
      differences: projection.differences,
    }
    if (projection.projection === 'verification') {
      if (change.invalidateVerification(invalidation)) changed = true
      continue
    }
    const gate = projection.projection === 'specApproval' ? 'spec' : 'signoff'
    const status = projection.to === 'revoked' ? 'revoked' : 'stale'
    if (change.markApprovalInvalid(gate, status, invalidation)) changed = true
  }
  if (needsArtifactReview(change, verdict.affectedArtifacts)) {
    change.invalidate(
      artifactCause(intent, verdict),
      actor,
      reasonFor(
        intent,
        artifactCause(intent, verdict) === 'spec-overlap-conflict'
          ? 'spec-overlap-conflict'
          : 'artifact-drift',
      ),
      verdict.affectedArtifacts.map((target) => ({
        type: target.artifactId,
        files: [target.fileKey],
      })),
      dag,
      intent.type === 'manual-invalidation' ? intent.policy : change.invalidationPolicy,
      taskArtifacts,
    )
    changed = true
  }
  if (verdict.recovery !== null && change.state === verdict.recovery.from) {
    change.recover(verdict.recovery, actor)
    changed = true
  }
  return changed
}

/**
 * Needs artifact review.
 *
 * @param change - change
 * @param targets - targets
 * @returns needs artifact review result
 */
function needsArtifactReview(change: Change, targets: readonly ArtifactReviewTarget[]): boolean {
  return targets.some((target) => {
    const artifact = change.getArtifact(target.artifactId)
    const file = artifact?.getFile(target.fileKey)
    if (file === undefined || file.status === 'skipped') return false
    const fileAlreadyOpen =
      file.status === 'pending-review' || file.status === 'drifted-pending-review'
    const artifactAlreadyOpen =
      artifact?.status === 'pending-review' || artifact?.status === 'drifted-pending-review'
    return !fileAlreadyOpen || !artifactAlreadyOpen
  })
}

/**
 * Artifact cause.
 *
 * @param intent - intent
 * @param verdict - verdict
 * @returns artifact cause result
 */
function artifactCause(
  intent: ReconciliationIntent,
  verdict: ChangeValidityVerdict,
): 'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' {
  if (intent.type === 'spec-overlap-conflict') return 'spec-overlap-conflict'
  if (intent.type === 'manual-invalidation') return 'artifact-review-required'
  if (verdict.affectedArtifacts.some((target) => target.origin === 'drift')) return 'artifact-drift'
  return 'artifact-review-required'
}

/**
 * Reason for.
 *
 * @param intent - intent
 * @param cause - cause
 * @returns reason for result
 */
function reasonFor(intent: ReconciliationIntent, cause: string): string {
  if (intent.type === 'manual-invalidation') return intent.reason
  if (intent.type === 'verification-invalidation') return intent.reason
  if (intent.type === 'spec-overlap-conflict') return intent.reason
  if (intent.type === 'scope-change') return intent.reason
  if (cause === 'implementation-drift') return 'Implementation files changed'
  if (cause === 'legacy-unknown') return 'Legacy evidence cannot be compared'
  return 'Artifact files require review'
}
