import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { InvalidInvalidateTargetError } from '../errors/invalid-invalidate-target-error.js'
import { InvalidateRequiresForceError } from '../errors/invalidate-requires-force-error.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import {
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
} from '../../domain/services/change-validity.js'
import { type ForceInvalidationRecovery } from '../errors/invalidate-requires-force-error.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'
import { type NextAction } from './get-status.js'

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

  /**
   * Creates a new `InvalidateChange` use case.
   *
   * @param changes - Change repository for loading and mutating changes
   * @param actor - Actor resolver for identity
   * @param schemaProvider - Schema provider for artifact type resolution
   * @param reconcile - Canonical reconciler that applies review, revocation, and recovery
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    reconcile: ReconcileChangeValidity,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._reconcile = reconcile
  }

  /**
   * Executes the manual invalidation.
   *
   * @param input - The invalidation command
   * @returns The persisted change and affected set report
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

    const schema = await this._schemaProvider.get()
    const resolvedTargets =
      effectivePolicy.artifacts === 'none' || effectivePolicy.artifacts === 'global'
        ? []
        : resolveTargets(change, input.targets ?? [], schema.artifacts())
    const revoke = consentToRevoke(change)
    if (revoke.length > 0 && input.force !== true) {
      throw new InvalidateRequiresForceError(forceRecoveries(change, revoke))
    }

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
    const reconciled = await this._reconcile.execute({
      name: input.name,
      actor,
      intent: {
        type: 'manual-invalidation',
        reason: input.reason,
        policy: effectivePolicy,
        targets,
        revoke: input.force === true ? revoke : [],
      },
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
      nextAction: invalidationNextAction(reconciled.change, reconciled.automaticReturn),
    }
  }
}

/**
 * Projects canonical recovery without reconstructing invalidation policy in adapters.
 *
 * @param change - Reconciled change
 * @param recovery - Automatic lifecycle return, when one was committed
 * @returns Core-owned next action
 */
function invalidationNextAction(change: Change, recovery: AutomaticRecovery | null): NextAction {
  if (recovery !== null) {
    return {
      targetStep: recovery.to,
      actionType: 'cognitive',
      reason: `Invalidation returned the change to ${recovery.to}`,
      command: recovery.to === 'designing' ? '/specd-design' : '/specd-verify',
    }
  }
  return {
    targetStep: change.state,
    actionType: 'cognitive',
    reason: 'Review the reported blockers before advancing',
    command: null,
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

  if (effectivePolicy.artifacts === 'none' || effectivePolicy.artifacts === 'global') {
    if (targets !== undefined && targets.length > 0) {
      errors.push(
        `--target is not allowed with policy '${effectivePolicy.artifacts}' — targeting is semantically irrelevant`,
      )
    }
  } else {
    if (targets === undefined || targets.length === 0) {
      errors.push(`At least one --target is required with policy '${effectivePolicy.artifacts}'`)
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
 * Consent to revoke.
 *
 * @param change - change
 * @returns consent to revoke result
 */
function consentToRevoke(change: Change): ('spec' | 'signoff')[] {
  const gates: ('spec' | 'signoff')[] = []
  if (change.specApproval?.status === 'valid') gates.push('spec')
  if (change.signoff?.status === 'valid') gates.push('signoff')
  return gates
}

/**
 * Selects the recovery target independently for every valid gate requiring confirmation.
 *
 * @param change - Current change snapshot
 * @param gates - Valid consent gates that would be revoked
 * @returns Exact gate/target pairs for adapter reporting
 */
function forceRecoveries(
  change: Change,
  gates: readonly ('spec' | 'signoff')[],
): ForceInvalidationRecovery[] {
  return gates.map((gate) => {
    const recovery = selectAutomaticRecovery(
      change.state,
      { artifacts: 'none', workflow: 'preserve' },
      gate === 'spec' ? 'revoked' : 'not-required',
      gate === 'signoff' ? 'revoked' : 'not-required',
      false,
    )
    return { gate, target: recovery?.to ?? change.state }
  })
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
