import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { FingerprintInputError } from '../errors/fingerprint-input-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { VerificationNotFoundError } from '../errors/verification-not-found-error.js'
import { VerificationInProgressError } from '../errors/verification-in-progress-error.js'
import { VerificationStaleError } from '../errors/verification-stale-error.js'
import { VerificationFingerprintMismatchError } from '../errors/verification-fingerprint-mismatch-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'
import { compareValidityFingerprints } from '../../domain/value-objects/validity-fingerprint.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { type ValidityFingerprintService } from '../services/validity-fingerprint-service.js'
import { type ApprovalGates } from './transition-change.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'

/** Input for the {@link ApproveSignoff} use case. */
export interface ApproveSignoffInput {
  /** The change to sign off. */
  readonly name: string
  /** Free-text rationale recorded in the signoff event. */
  readonly reason: string
}

/**
 * Records sign-off consent only while the reconciled change is `done`
 * with current completed verification.
 *
 * Historic `pending-signoff` manifests still drain to `signed-off`.
 */
export class ApproveSignoff {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _approvals: ApprovalGates
  private readonly _reconcile: ReconcileChangeValidity
  private readonly _fingerprint: ValidityFingerprintService
  private readonly _refresh: RefreshImplementationTracking

  /**
   * Creates a new `ApproveSignoff` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the privacy-decorated actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param approvals - Whether approval gates are active in the project configuration
   * @param reconcile - Canonical validity reconciler
   * @param fingerprint - Shared complete fingerprint collector
   * @param refresh - Implementation tracking refresh run before reconciliation
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    approvals: ApprovalGates,
    reconcile: ReconcileChangeValidity,
    fingerprint: ValidityFingerprintService,
    refresh: RefreshImplementationTracking,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._approvals = approvals
    this._reconcile = reconcile
    this._fingerprint = fingerprint
    this._refresh = refresh
  }

  /**
   * Refreshes tracking, reconciles validity, and records sign-off when eligible.
   *
   * @param input - Signoff parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the signoff gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the reconciled change cannot accept sign-off
   * @throws {SchemaMismatchError} If the change schema differs from the active schema
   * @throws {VerificationNotFoundError} If completed verification is missing
   * @throws {VerificationFingerprintMismatchError} If the fresh fingerprint differs from verification
   * @throws {FingerprintInputError} If the complete fingerprint cannot be collected
   */
  async execute(input: ApproveSignoffInput): Promise<Change> {
    if (!this._approvals.signoff) {
      throw new ApprovalGateDisabledError('signoff')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const schema = await this._schemaProvider.get()
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    await this._refresh.execute({ name: input.name })
    const actor = await this._actor.identity()
    const mutation = await this._reconcile.mutate({ name: input.name, actor }, async (ctx) => {
      const state = ctx.change.state
      if (state !== 'done' && state !== 'pending-signoff') {
        return { outcome: 'state' as const, state }
      }
      const completed = ctx.change.verification.completed
      if (completed === undefined) {
        return {
          outcome:
            ctx.change.verification.activeAttempt === undefined
              ? ('verification-missing' as const)
              : ('verification-active' as const),
        }
      }
      if (completed.status !== 'valid' || completed.fingerprint.implementation === null) {
        return { outcome: 'verification-stale' as const }
      }
      const collected = await this._fingerprint.completeFingerprint(ctx.change)
      if (collected.fingerprint === null) {
        return { outcome: 'fingerprint' as const, failures: collected.failures }
      }
      const comparison = compareValidityFingerprints(
        {
          version: 1,
          artifacts: completed.fingerprint.artifacts,
          implementation: completed.fingerprint.implementation,
        },
        collected.fingerprint,
      )
      if (!comparison.equal) {
        return { outcome: 'mismatch' as const, differences: comparison.differences }
      }
      const artifactId = blockingArtifact(ctx.change, schema, ctx.before)
      if (artifactId !== null) {
        return { outcome: 'ineligible' as const, state, artifactId }
      }
      ctx.change.recordSignoff(input.reason, collected.fingerprint, completed.id, actor)
      if (ctx.change.state === 'pending-signoff') {
        ctx.change.transition('signed-off', actor)
      }
      return { outcome: 'ok' as const }
    })

    if (mutation.result.outcome === 'state') {
      throw new InvalidStateTransitionError(mutation.result.state, 'done')
    }
    if (mutation.result.outcome === 'verification-missing') {
      throw new VerificationNotFoundError(input.name)
    }
    if (mutation.result.outcome === 'verification-active') {
      throw new VerificationInProgressError(input.name)
    }
    if (mutation.result.outcome === 'verification-stale') {
      throw new VerificationStaleError(input.name)
    }
    if (mutation.result.outcome === 'fingerprint') {
      throw new FingerprintInputError(mutation.result.failures)
    }
    if (mutation.result.outcome === 'mismatch') {
      throw new VerificationFingerprintMismatchError(mutation.result.differences)
    }
    if (mutation.result.outcome === 'ineligible') {
      throw new InvalidStateTransitionError(mutation.result.state, 'done', {
        type: 'incomplete-artifact',
        artifactId: mutation.result.artifactId,
      })
    }
    return mutation.change
  }
}

/**
 * Blocking artifact.
 *
 * @param change - change
 * @param schema - schema
 * @param verdict - verdict
 * @returns blocking artifact result
 */
function blockingArtifact(
  change: Change,
  schema: Schema,
  verdict: ChangeValidityVerdict,
): string | null {
  if (verdict.artifactReviewRequired) {
    return verdict.affectedArtifacts[0]?.artifactId ?? 'unknown'
  }
  const requires = schema.workflowStep(change.state)?.requires ?? []
  for (const artifactId of requires) {
    const type = schema.artifact(artifactId)
    if (type?.hasTasks === true) continue
    const artifact = change.getArtifact(artifactId)
    if (artifact === null) return artifactId
  }
  return null
}
