import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { FingerprintInputError } from '../errors/fingerprint-input-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { type ValidityFingerprintService } from '../services/validity-fingerprint-service.js'
import { type ApprovalGates } from './transition-change.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'

/** Input for the {@link ApproveSpec} use case. */
export interface ApproveSpecInput {
  /** The change to approve the spec for. */
  readonly name: string
  /** Free-text rationale recorded in the approval event. */
  readonly reason: string
}

/**
 * Records spec-gate consent only while the reconciled change is `ready`.
 *
 * Historic `pending-spec-approval` manifests still drain to `spec-approved`.
 * New work does not enter that state, and this use case does not invent it.
 */
export class ApproveSpec {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _approvals: ApprovalGates
  private readonly _reconcile: ReconcileChangeValidity
  private readonly _fingerprint: ValidityFingerprintService

  /**
   * Creates a new `ApproveSpec` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the privacy-decorated actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param approvals - Whether approval gates are active in the project configuration
   * @param reconcile - Canonical validity reconciler
   * @param fingerprint - Shared artifact fingerprint collector
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    approvals: ApprovalGates,
    reconcile: ReconcileChangeValidity,
    fingerprint: ValidityFingerprintService,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._approvals = approvals
    this._reconcile = reconcile
    this._fingerprint = fingerprint
  }

  /**
   * Reconciles validity and records spec consent when the change remains eligible.
   *
   * @param input - Approval parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the spec approval gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the reconciled change cannot accept spec consent
   * @throws {SchemaMismatchError} If the change schema differs from the active schema
   * @throws {FingerprintInputError} If a required artifact fingerprint cannot be collected
   */
  async execute(input: ApproveSpecInput): Promise<Change> {
    if (!this._approvals.spec) {
      throw new ApprovalGateDisabledError('spec')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const schema = await this._schemaProvider.get()
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    const actor = await this._actor.identity()
    const mutation = await this._reconcile.mutate({ name: input.name, actor }, async (ctx) => {
      const state = ctx.change.state
      if (state !== 'ready' && state !== 'pending-spec-approval') {
        return { outcome: 'state' as const, state }
      }
      const collected = await this._fingerprint.specApprovalFingerprint(ctx.change)
      if (collected.fingerprint === null) {
        return { outcome: 'fingerprint' as const, failures: collected.failures }
      }
      const artifactId = blockingArtifact(ctx.change, schema, ctx.before)
      if (artifactId !== null) {
        return { outcome: 'ineligible' as const, state, artifactId }
      }
      ctx.change.recordSpecApproval(input.reason, collected.fingerprint, actor)
      if (ctx.change.state === 'pending-spec-approval') {
        ctx.change.transition('spec-approved', actor)
      }
      return { outcome: 'ok' as const }
    })

    if (mutation.result.outcome === 'state') {
      throw new InvalidStateTransitionError(mutation.result.state, 'ready')
    }
    if (mutation.result.outcome === 'fingerprint') {
      throw new FingerprintInputError(mutation.result.failures)
    }
    if (mutation.result.outcome === 'ineligible') {
      throw new InvalidStateTransitionError(mutation.result.state, 'ready', {
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
    for (const file of artifact.files.values()) {
      if (
        file.status === 'missing' ||
        file.status === 'pending-review' ||
        file.status === 'drifted-pending-review' ||
        file.status === 'in-progress'
      ) {
        return artifactId
      }
    }
  }
  return null
}
