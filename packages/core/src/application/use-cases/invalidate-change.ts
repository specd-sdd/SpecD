import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { InvalidInvalidateTargetError } from '../errors/invalid-invalidate-target-error.js'
import { InvalidateRequiresForceError } from '../errors/invalidate-requires-force-error.js'
import { type ValidityFingerprint } from '../../domain/value-objects/validity-fingerprint.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import {
  isArtifactInvalidationPolicy,
  isWorkflowInvalidationPolicy,
  resolveInvalidationPolicy,
  type InvalidationPolicy,
  type InvalidationPolicyOverride,
} from '../../domain/value-objects/invalidation-policy.js'
import {
  type AutomaticRecovery,
  type ProjectionChange,
  type ArtifactReviewTarget,
  type ValidityBlocker,
  selectAutomaticRecovery,
  collectChangeReviewTargets,
} from '../../domain/services/change-validity.js'
import { type ForceInvalidationRecovery } from '../errors/invalidate-requires-force-error.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'
import { type NextAction } from './get-status.js'
import { evaluateLifecycle } from '../services/lifecycle-evaluation.js'
import { evaluateLegalTargets } from '../services/execute-matching-predicates.js'
import { TRANSITION_BINDINGS } from '../../domain/services/check-bindings.js'
import { type CheckRegistry } from '../../domain/services/check-registry.js'
import { projectArtifacts, toEffectiveStatusMap } from '../../domain/services/lifecycle-verdict.js'
import { type CheckBinding } from '../../domain/services/transition-checks.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'

/** A single target identifying an artifact (and optionally a specific file within it). */
export interface InvalidateTargetInput {
  readonly artifactId: string
  readonly specId?: string
}

/** Input contract for the manual invalidation use case. */
export interface InvalidateChangeInput {
  readonly name: string
  readonly reason: string
  readonly policyOverride?: InvalidationPolicyOverride
  readonly targets?: readonly InvalidateTargetInput[]
  readonly force?: boolean
}

/** A single file affected by invalidation, labelled with its expansion origin. */
export interface AffectedArtifactFile {
  readonly artifactId: string
  readonly key: string
  readonly filename: string
  readonly expansion: 'direct' | 'downstream' | 'global'
}

/** Result of a manual invalidation execution. */
export interface InvalidateChangeResult {
  readonly change: Change
  /** Exact human-readable reason persisted for this invalidation. */
  readonly reason: string
  readonly effectivePolicy: InvalidationPolicy
  readonly affected: readonly AffectedArtifactFile[]
  /** Projection status transitions committed by reconciliation. */
  readonly projectionChanges: readonly ProjectionChange[]
  /** Lifecycle return committed by reconciliation, when one was required. */
  readonly automaticReturn: AutomaticRecovery | null
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}

import { ResolveChangeSchema } from '../services/resolve-change-schema.js'

/**
 * Use case for manual, targeted invalidation of a change's artifacts.
 *
 * Validates the command shape against the effective policy, normalises targets,
 * enforces the approval/signoff guard, and reports the final expanded affected set.
 */
export class InvalidateChange {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _reconcile: ReconcileChangeValidity
  private readonly _resolveChangeSchema: ResolveChangeSchema
  private readonly _approvals: { readonly spec: boolean; readonly signoff: boolean }
  private readonly _transitionBindings: readonly CheckBinding[]
  private readonly _checkRegistry?: CheckRegistry

  /**
   * Creates a new `InvalidateChange` use case.
   *
   * @param changes - Change repository for loading and mutating changes
   * @param actor - Actor resolver for identity
   * @param schemaProvider - Schema provider for artifact type resolution
   * @param reconcile - Canonical reconciler that applies review, revocation, and recovery
   * @param resolveChangeSchema - Shared change schema resolver
   * @param approvals - Configured approval gates, used to route the post-invalidation next action
   * @param approvals.spec - Whether spec approval is enabled
   * @param approvals.signoff - Whether sign-off approval is enabled
   * @param transitionBindings - Composed transition check bindings for post-recovery evaluation
   * @param checkRegistry - Optional check registry for open check catalog and governance
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    reconcile: ReconcileChangeValidity,
    resolveChangeSchema?: ResolveChangeSchema,
    approvals: { readonly spec: boolean; readonly signoff: boolean } = {
      spec: false,
      signoff: false,
    },
    transitionBindings: readonly CheckBinding[] = TRANSITION_BINDINGS,
    checkRegistry?: CheckRegistry,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._reconcile = reconcile
    this._resolveChangeSchema = resolveChangeSchema ?? new ResolveChangeSchema(schemaProvider)
    this._approvals = approvals
    this._transitionBindings = transitionBindings
    if (checkRegistry !== undefined) {
      this._checkRegistry = checkRegistry
    }
  }

  /**
   * Executes the manual invalidation.
   *
   * @param input - The invalidation command
   * @returns The persisted change and affected set report
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the change's schema reference cannot be resolved
   * @throws {SchemaProviderIdentityMismatchError} If the resolved schema provider returns a schema whose canonical name differs from the change's schema reference
   * @throws {InvalidInvalidateTargetError} If policy/target shape or target selectors are invalid
   * @throws {InvalidateRequiresForceError} If active consent gates would be revoked without `force`
   */
  async execute(input: InvalidateChangeInput): Promise<InvalidateChangeResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const effectivePolicy = resolveInvalidationPolicy(
      change.invalidationPolicy,
      input.policyOverride,
    )
    const targetErrors = validateCommandShape(effectivePolicy, input.targets)
    if (targetErrors.length > 0) {
      throw new InvalidInvalidateTargetError(targetErrors)
    }

    const { schema } = await this._resolveChangeSchema.execute({
      changeName: change.name,
      schemaName: change.schemaName,
      schemaVersion: change.schemaVersion,
    })
    const resolvedTargets =
      effectivePolicy.artifacts === 'none' || effectivePolicy.artifacts === 'global'
        ? []
        : resolveTargets(change, input.targets ?? [], schema.artifacts())
    const targets: ArtifactReviewTarget[] =
      effectivePolicy.artifacts === 'global'
        ? globalTargets(change, schema)
        : resolvedTargets.map((target) => ({
            artifactId: target.artifactId,
            fileKey: target.key,
            filename: target.filename,
            origin: 'direct' as const,
          }))

    const actor = await this._actor.identity()
    // The force guard reads the change after the reconciler's pre-pass, so a consent already
    // stale per fingerprint has recovered by itself and needs no `force`. The guard and the
    // invalidation share one serialized mutation.
    const reconciled = await this._reconcile.mutate({ name: input.name, actor }, async (ctx) => {
      const valid = validConsent(ctx.change)
      // Only gates enabled in the configured approvals are guarded and previewed; the reconciler
      // treats a disabled gate as not required, so its consent is revoked silently and moves nothing.
      const revoke = valid.filter((gate) => this._approvals[gate])
      const disabled = valid.filter((gate) => !this._approvals[gate])
      if (revoke.length > 0 && input.force !== true) {
        throw new InvalidateRequiresForceError(
          forceRecoveries(
            ctx.change,
            revoke,
            effectivePolicy,
            previewArtifactReviewRequired(ctx.change, schema, targets, ctx.fingerprint),
          ),
        )
      }
      await ctx.reconcileAfter({
        type: 'manual-invalidation',
        reason: input.reason,
        policy: effectivePolicy,
        targets,
        revoke: input.force === true ? [...revoke, ...disabled] : disabled,
      })
    })

    return {
      change: reconciled.change,
      reason: input.reason,
      effectivePolicy,
      affected: reconciled.affectedArtifacts.map((target) => ({
        artifactId: target.artifactId,
        key: target.fileKey,
        filename: target.filename,
        expansion:
          target.origin === 'downstream' || target.origin === 'global' ? target.origin : 'direct',
      })),
      projectionChanges: reconciled.projectionChanges,
      automaticReturn: reconciled.automaticReturn,
      blockers: reconciled.verdict.blockers,
      nextAction: await invalidationNextAction(
        reconciled.change,
        schema,
        this._approvals,
        reconciled.verdict,
        reconciled.automaticReturn,
        this._transitionBindings,
        this._checkRegistry,
      ),
    }
  }
}

/**
 * Projects canonical recovery without reconstructing invalidation policy in adapters.
 * The guidance comes from evaluating forward checks of the recovered state under the
 * change's schema, so a disabled `verifying` step never yields a verification intent.
 *
 * @param change - Reconciled change
 * @param schema - The change's sovereign schema
 * @param approvals - Configured approval gates
 * @param approvals.spec - Whether spec approval is enabled
 * @param approvals.signoff - Whether sign-off approval is enabled
 * @param verdict - Canonical validity verdict after reconciliation
 * @param recovery - Automatic lifecycle return, when one was committed
 * @param transitionBindings - Composed transition check bindings
 * @param checkRegistry - Optional check registry for open check catalog and governance
 * @returns Core-owned host-neutral next action
 */
async function invalidationNextAction(
  change: Change,
  schema: Schema,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  verdict: ChangeValidityVerdict,
  recovery: AutomaticRecovery | null,
  transitionBindings: readonly CheckBinding[],
  checkRegistry?: CheckRegistry,
): Promise<NextAction> {
  if (recovery !== null) {
    const effectiveStatusByArtifact = toEffectiveStatusMap(projectArtifacts(change, schema))
    const legalTargets = await evaluateLegalTargets(transitionBindings, {
      change,
      schema,
      approvals,
      effectiveStatusByArtifact,
      validity: verdict,
      ...(checkRegistry !== undefined ? { checkRegistry } : {}),
    })
    const lifecycle = evaluateLifecycle(change, schema, {
      approvals,
      validity: verdict,
      checksByTarget: legalTargets.checksByTarget,
      bindingsByTarget: legalTargets.bindingsByTarget,
    })
    return {
      ...lifecycle.nextAction,
      reason: `Invalidation returned the change to ${recovery.to}`,
    }
  }
  return {
    targetStep: change.state,
    actionType: 'cognitive',
    reason: 'Review the reported blockers before advancing',
    intent: null,
  }
}

/**
 * Validates that the provided targets are compatible with the effective policy.
 *
 * @param effectivePolicy - The resolved invalidation policy
 * @param targets - The caller-provided targets (may be undefined)
 * @returns An array of error strings (empty when valid)
 */
function validateCommandShape(
  effectivePolicy: InvalidationPolicy,
  targets: readonly InvalidateTargetInput[] | undefined,
): string[] {
  const errors: string[] = []

  if (!isArtifactInvalidationPolicy(effectivePolicy.artifacts)) {
    errors.push(`unsupported artifact policy value '${String(effectivePolicy.artifacts)}'`)
  }
  if (!isWorkflowInvalidationPolicy(effectivePolicy.workflow)) {
    errors.push(`unsupported workflow policy value '${String(effectivePolicy.workflow)}'`)
  }
  if (errors.length > 0) return errors

  if (effectivePolicy.artifacts === 'none' || effectivePolicy.artifacts === 'global') {
    if (targets !== undefined && targets.length > 0) {
      errors.push(
        `targets are not allowed with policy '${effectivePolicy.artifacts}' — targeting is semantically irrelevant`,
      )
    }
  } else {
    if (targets === undefined || targets.length === 0) {
      errors.push(`At least one target is required with policy '${effectivePolicy.artifacts}'`)
    }
  }

  return errors
}

/**
 * Resolves raw target inputs into concrete artifact/file entries.
 *
 * @param change - The change whose artifacts are targeted
 * @param targets - Raw target inputs from the command
 * @param artifactTypes - Schema artifact types for scope validation
 * @returns Deduplicated concrete target entries
 * @throws {InvalidInvalidateTargetError} When an artifact or file is unknown or scope is invalid
 */
function resolveTargets(
  change: Change,
  targets: readonly InvalidateTargetInput[],
  artifactTypes: readonly { id: string; scope: string }[],
): Array<{ artifactId: string; key: string; filename: string }> {
  const results: Array<{ artifactId: string; key: string; filename: string }> = []
  const artifactTypeMap = new Map(artifactTypes.map((t) => [t.id, t]))
  const errors: string[] = []

  for (const target of targets) {
    const artifact = change.getArtifact(target.artifactId)
    if (artifact === null) {
      errors.push(`Unknown artifact '${target.artifactId}'`)
      continue
    }

    const artType = artifactTypeMap.get(target.artifactId)
    if (target.specId !== undefined && artType?.scope === 'change') {
      errors.push(
        `Cannot use '${target.artifactId}@${target.specId}' — artifact '${target.artifactId}' is scope:change`,
      )
      continue
    }

    if (target.specId !== undefined) {
      const file = artifact.getFile(target.specId)
      if (file === undefined) {
        errors.push(`Unknown file '${target.specId}' in artifact '${target.artifactId}'`)
        continue
      }
      results.push({
        artifactId: target.artifactId,
        key: target.specId,
        filename: file.filename,
      })
    } else {
      for (const [, file] of artifact.files) {
        results.push({
          artifactId: target.artifactId,
          key: file.key,
          filename: file.filename,
        })
      }
    }
  }

  if (errors.length > 0) {
    throw new InvalidInvalidateTargetError(errors)
  }

  const seen = new Set<string>()
  return results.filter((r) => {
    const key = `${r.artifactId}::${r.key}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Valid consent gates.
 *
 * Callers pass the change after the reconciler's pre-pass, so projection status already
 * reflects fingerprint staleness; only consent that is still valid can be revoked.
 *
 * @param change - Change snapshot after reconciliation
 * @returns Consent gates whose record is still valid (enabled or not)
 */
function validConsent(change: Change): ('spec' | 'signoff')[] {
  const gates: ('spec' | 'signoff')[] = []
  if (change.specApproval?.status === 'valid') gates.push('spec')
  if (change.signoff?.status === 'valid') gates.push('signoff')
  return gates
}

/**
 * Previews the reconciler's `artifactReviewRequired` verdict for a forced invalidation.
 *
 * Mirrors the reconciler's review targets: non-task artifacts the request marks for review,
 * plus non-task files already drifted (flagged, or whose current hash differs from the validated
 * one) or pending review, which stay required even under artifact policy `none`.
 *
 * @param change - Current change snapshot
 * @param schema - The change's sovereign schema
 * @param targets - Review targets the request marks (empty for `none`)
 * @param fingerprint - Fresh validity fingerprint from the reconciler pre-pass, when available
 * @returns Whether the reconciler will report required artifact review
 */
function previewArtifactReviewRequired(
  change: Change,
  schema: Schema,
  targets: readonly ArtifactReviewTarget[],
  fingerprint: ValidityFingerprint | null,
): boolean {
  const taskArtifacts = new Set(
    schema.artifacts().flatMap((artifact) => (artifact.hasTasks ? [artifact.id] : [])),
  )
  if (targets.some((target) => !taskArtifacts.has(target.artifactId))) return true
  const found = collectChangeReviewTargets(change, fingerprint, taskArtifacts)
  return found.drifted.length > 0 || found.pending.length > 0
}

/**
 * Previews the single combined recovery the reconciler would commit for the whole set of
 * revoked gates (spec consent outranks sign-off, which outranks workflow redesign). Every
 * affected gate is listed with the target of that one recovery, or the current state when
 * no move would be committed.
 *
 * @param change - Current change snapshot
 * @param gates - Valid consent gates that would be revoked
 * @param policy - Effective invalidation policy the reconciler will commit
 * @param artifactReviewRequired - Whether the request marks artifacts for review
 * @returns Exact gate/target pairs for adapter reporting
 */
function forceRecoveries(
  change: Change,
  gates: readonly ('spec' | 'signoff')[],
  policy: InvalidationPolicy,
  artifactReviewRequired: boolean,
): ForceInvalidationRecovery[] {
  const recovery = selectAutomaticRecovery(
    change.state,
    policy,
    gates.includes('spec') ? 'revoked' : 'not-required',
    gates.includes('signoff') ? 'revoked' : 'not-required',
    artifactReviewRequired,
  )
  const target = recovery?.to ?? change.state
  return gates.map((gate) => ({ gate, target }))
}

/**
 * Global targets.
 *
 * @param change - change
 * @param schema - schema
 * @returns global targets result
 */
function globalTargets(change: Change, schema: Schema): ArtifactReviewTarget[] {
  const taskArtifacts = new Set(
    schema.artifacts().flatMap((artifact) => (artifact.hasTasks ? [artifact.id] : [])),
  )
  const targets: ArtifactReviewTarget[] = []
  for (const [typeId, artifact] of change.artifacts) {
    if (taskArtifacts.has(typeId)) continue
    for (const file of artifact.files.values()) {
      if (file.status === 'skipped') continue
      targets.push({
        artifactId: typeId,
        fileKey: file.key,
        filename: file.filename,
        origin: 'global',
      })
    }
  }
  return targets
}
