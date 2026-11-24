import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import {
  listBypassedWorkflowSteps,
  nextWorkflowStep,
} from '../../domain/services/workflow-topology.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ResolveChangeSchema } from '../services/resolve-change-schema.js'
import { evaluateTransitionCandidate } from '../services/evaluate-transition-candidate.js'
import { evaluateLegalTargets } from '../services/execute-matching-predicates.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { HappyPathNextUnavailableError } from '../../domain/errors/happy-path-next-unavailable-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { CheckPredicateFailedError } from '../../domain/errors/check-predicate-failed-error.js'
import { projectArtifacts } from '../../domain/services/lifecycle-verdict.js'
import { evaluateLifecycle } from '../services/lifecycle-evaluation.js'
import { validateSkipChecks } from '../services/validate-skip-checks.js'
import {
  resolveEffectiveBindings,
  type CheckBinding,
  type CheckProgressEvent,
  type CheckResult,
  type OnCheckProgress,
} from '../../domain/services/transition-checks.js'
import { type CheckRegistry } from '../../domain/services/check-registry.js'
import { hookFailureMode, matchingEffects } from '../services/execute-hook-effect.js'
import {
  buildCheckExecutionContext,
  executeCheckWithProgress,
  transitionAttemptFor,
} from '../services/execute-matching-predicates.js'
import { throwHookFailed } from '../checks/hook-failed.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'
import { Logger } from '../logger.js'
import { InvalidCompositionFactoryArgumentsError } from '../../domain/errors/invalid-composition-factory-arguments-error.js'
import { ReconciledOperationBlockedError } from '../errors/reconciled-operation-blocked-error.js'
import { type AutomaticRecovery } from '../../domain/services/change-validity.js'
import { type NextAction } from './get-status.js'

/** Selectors for granular hook phase skipping during transitions. */
export type HookPhaseSelector = 'source.pre' | 'source.post' | 'target.pre' | 'target.post' | 'all'

/** Approval gate configuration baked at use-case construction from `SpecdConfig.approvals`. */
export type ApprovalGates = { readonly spec: boolean; readonly signoff: boolean }

/** Input for the {@link TransitionChange} use case. */
export interface TransitionChangeInput {
  /** The change to transition. */
  readonly name: string
  /**
   * The requested target state, or `'next'` for Core-resolved happy-path next.
   *
   * The requested target is the persist target. Approval gates do not rewrite
   * `implementing` to `pending-spec-approval` or `archivable` to `pending-signoff`.
   */
  readonly to: ChangeState | 'next'
  /**
   * Which hook phases to skip during the transition. Valid selectors:
   * `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`.
   *
   * When `'all'` is in the set, all hooks are skipped. When empty (default),
   * all applicable hooks execute. The caller is responsible for invoking
   * skipped hooks separately via `RunStepHooks`. `skipHookPhases` skips effects
   * only — predicates still run.
   */
  readonly skipHookPhases?: ReadonlySet<HookPhaseSelector>
  /**
   * Check identifiers to bypass. Must declare `skippable: true` in matching binding.
   */
  readonly skipChecks?: readonly string[]
  /**
   * When omitted or `true`, refresh tracked implementation files before
   * transition for active changes only. When `false`, skips only that
   * pre-evaluation refresh: the reconcile after hooks always refreshes, so files
   * created by hooks still gate the transition.
   */
  readonly refreshImplementationTrackingBefore?: boolean
}

/** Progress event emitted during a transition. */
export type TransitionProgressEvent =
  | CheckProgressEvent
  | { type: 'requires-check'; artifactId: string; satisfied: boolean }
  | {
      type: 'task-completion-failed'
      artifactId: string
      incomplete: number
      complete: number
      total: number
    }
  | { type: 'transitioned'; from: ChangeState; to: ChangeState }

/** Callback for receiving transition progress events. */
export type OnTransitionProgress = (event: TransitionProgressEvent) => void

/** Result returned by {@link TransitionChange}. */
export interface TransitionChangeResult {
  /** The updated change after the transition. */
  readonly change: Change
}

const SKILL_HOP_SOURCES: ReadonlySet<ChangeState> = new Set(['done', 'signed-off', 'archivable'])
const SKILL_HOP_TARGETS: ReadonlySet<ChangeState> = new Set(['implementing', 'verifying'])

/**
 * Performs a lifecycle state transition on a change with shared predicate
 * evaluation, task completion gating, and hook execution.
 *
 * Approval is a predicate on the requested delivery edge. New work stays in
 * `ready` / `done` until `ApproveSpec` / `ApproveSignoff` records consent.
 *
 * Predicates and effects run via composed `Check` instances (`execute(ctx)`).
 * `skipHookPhases` skips effects only — predicates still run.
 * `source.post` runs only when `along === 'forward'` (binding applicability).
 *
 * Every failed predicate (including unmet required artifacts and incomplete tasks)
 * surfaces as a `CheckPredicateFailedError` carrying the check id, `details`, the
 * check-declared `action`, and `skippable` from the resolved binding.
 */
export class TransitionChange {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _resolveChangeSchema: ResolveChangeSchema
  private readonly _refresh: RefreshImplementationTracking
  private readonly _approvals: ApprovalGates
  private readonly _transitionBindings: readonly CheckBinding[]
  private readonly _reconcile: ReconcileChangeValidity
  private readonly _checkRegistry?: CheckRegistry

  /**
   * Creates a new `TransitionChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the fully-resolved schema or shared resolver
   * @param refreshImplementationTracking - Primitive for optional pre-transition refresh
   * @param approvals - Whether approval gates are active in the project configuration
   * @param transitionBindings - Composed transition check bindings
   * @param reconcile - Canonical reconciler (required at runtime). Recovery is committed before checks and the designing hop does not broadly invalidate artifacts.
   * @param checkRegistry - Optional CheckRegistry for open check catalog and governance resolution.
   * @param resolveChangeSchema - Optional shared resolver for sovereign change schemas.
   * @throws {InvalidCompositionFactoryArgumentsError} If `reconcile` is not supplied
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider | ResolveChangeSchema,
    refreshImplementationTracking: RefreshImplementationTracking,
    approvals: ApprovalGates,
    transitionBindings: readonly CheckBinding[],
    reconcile?: ReconcileChangeValidity,
    checkRegistry?: CheckRegistry,
    resolveChangeSchema?: ResolveChangeSchema,
  ) {
    this._changes = changes
    this._actor = actor
    if (
      schemaProvider instanceof ResolveChangeSchema ||
      ('execute' in schemaProvider &&
        typeof (schemaProvider as unknown as ResolveChangeSchema).execute === 'function')
    ) {
      this._resolveChangeSchema = schemaProvider as unknown as ResolveChangeSchema
      this._schemaProvider = schemaProvider as unknown as SchemaProvider
    } else {
      this._schemaProvider = schemaProvider
      this._resolveChangeSchema = resolveChangeSchema ?? new ResolveChangeSchema(schemaProvider)
    }
    this._refresh = refreshImplementationTracking
    this._approvals = approvals
    this._transitionBindings = transitionBindings
    if (reconcile === undefined) {
      throw new InvalidCompositionFactoryArgumentsError('TransitionChange', 'reconcile is required')
    }
    this._reconcile = reconcile
    if (checkRegistry !== undefined) {
      this._checkRegistry = checkRegistry
    }
  }

  /**
   * Executes the use case.
   *
   * When `refreshImplementationTrackingBefore` is not `false`, active changes
   * are refreshed before lifecycle evaluation and mutation. Setting it to `false`
   * skips only that pre-evaluation refresh; the post-hook reconcile always refreshes.
   *
   * @param input - Transition parameters
   * @param onProgress - Optional callback for progress events
   * @returns The transition result with the updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the change's schema reference cannot be resolved
   * @throws {SchemaProviderIdentityMismatchError} If the resolved schema provider returns a schema whose canonical name differs from the change's schema reference
   * @throws {InvalidStateTransitionError} For a committed movement with no automatic return, or when the entity's own transition check rejects the edge inside the persisted mutation; an illegal edge or unmet predicate is otherwise reported as CheckPredicateFailedError
   * @throws {CheckNotSkippableError} If an unskippable or effect check is supplied to skipChecks
   * @throws {UnknownCheckError} If an unregistered check is supplied to skipChecks
   * @throws {CheckPredicateFailedError} If a predicate check fails
   * @throws {HookFailedError} If a source.post or target.pre hook exits with a non-zero code
   * @throws {ReconciledOperationBlockedError} If validity reconciliation already committed a recovery
   * @throws {HappyPathNextUnavailableError} If `to` is `'next'` and the current state has no happy-path hop
   */
  async execute(
    input: TransitionChangeInput,
    onProgress?: OnTransitionProgress,
  ): Promise<TransitionChangeResult> {
    let change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const beforeState = change.state
    let validity: ChangeValidityVerdict | undefined
    const reconciled = await this._reconcile.execute({
      name: input.name,
      refreshImplementationTracking: input.refreshImplementationTrackingBefore !== false,
    })
    change = reconciled.change
    validity = reconciled.verdict
    if (change.state !== beforeState) {
      if (reconciled.automaticReturn !== null) {
        const { schema: recoverySchema } = await this._resolveChangeSchema.execute({
          changeName: change.name,
          schemaName: change.schemaName,
          schemaVersion: change.schemaVersion,
        })
        throw await this._committedRecoveryError(
          input.name,
          change,
          recoverySchema,
          reconciled.automaticReturn,
          reconciled.verdict,
        )
      }
      throw new InvalidStateTransitionError(
        change.state,
        input.to === 'next' ? beforeState : input.to,
      )
    }

    const fromState = change.state
    const { schema } = await this._resolveChangeSchema.execute({
      changeName: change.name,
      schemaName: change.schemaName,
      schemaVersion: change.schemaVersion,
    })
    let requestedTarget: ChangeState
    if (input.to === 'next') {
      const next = nextWorkflowStep(fromState, schema, this._approvals)
      if (next === null) {
        throw new HappyPathNextUnavailableError(fromState)
      }
      requestedTarget = next
    } else {
      requestedTarget = input.to
    }

    const actor = await this._actor.identity()

    const projectedArtifacts = projectArtifacts(change, schema)
    const effectiveStatusByArtifact = toEffectiveStatusMap(projectedArtifacts)
    const { attempt, along } = transitionAttemptFor(
      fromState,
      requestedTarget,
      schema,
      this._approvals,
    )

    const bypassedSteps = listBypassedWorkflowSteps(
      fromState,
      requestedTarget,
      schema,
      this._approvals,
    )

    const effectiveBindings = resolveEffectiveBindings({
      baseBindings: this._transitionBindings,
      schema,
      targetStep: requestedTarget,
      bypassedSteps,
      from: fromState,
      along,
      ...(this._checkRegistry !== undefined ? { registry: this._checkRegistry } : {}),
    })

    // Core accepts only the uniform skipChecks contract. Legacy flags are adapter concerns.
    // Validate against the resolved bindings for this attempt: policy (`skippable`) is
    // whatever the schema-composed cascade produced.
    const skipChecksList = [
      ...validateSkipChecks({
        skipChecks: input.skipChecks ?? [],
        effectiveBindings,
        ...(this._checkRegistry !== undefined ? { checkRegistry: this._checkRegistry } : {}),
      }),
    ]

    // A bypass is validated even for the `designing -> designing` no-op so a bogus id is rejected
    // instead of being silently ignored.
    if (fromState === 'designing' && requestedTarget === 'designing') {
      return { change }
    }

    const skip = input.skipHookPhases ?? new Set<HookPhaseSelector>()
    const skipHookPhases = [...skip]
    const onCheckProgress: OnCheckProgress | undefined =
      onProgress === undefined ? undefined : (event) => onProgress(event)
    const passMemo = new Map<string, unknown>()
    const candidate = await evaluateTransitionCandidate({
      change,
      schema,
      approvals: this._approvals,
      target: requestedTarget,
      mode: 'execute',
      baseBindings: this._transitionBindings,
      passMemo,
      effectiveStatusByArtifact,
      ...(this._checkRegistry !== undefined ? { checkRegistry: this._checkRegistry } : {}),
      ...(validity !== undefined ? { validity } : {}),
      ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
      skipChecks: skipChecksList,
    })
    const effectiveTarget = requestedTarget
    const workflowStep = schema.workflowStep(effectiveTarget) ?? null
    const lifecycle = evaluateLifecycle(change, schema, {
      requestedTarget,
      approvals: this._approvals,
      checksByTarget: { [requestedTarget]: candidate.checks },
      ...(validity !== undefined ? { validity } : {}),
    })

    Logger.debug('TransitionChange projected evaluateLifecycle routing', {
      change: change.name,
      fromState,
      requestedTarget,
      effectiveTarget,
      along,
      allowed: candidate.allowed,
      blockerCodes: lifecycle.blockers.map((blocker) => blocker.code),
    })

    if (!candidate.allowed) {
      this._throwPredicateFailures(
        candidate.checks,
        candidate.bindings,
        fromState,
        effectiveTarget,
        onProgress,
      )
    }

    this._emitRequiresProgress(
      candidate.checks,
      workflowStep?.requires ?? [],
      lifecycle.artifacts,
      onProgress,
    )

    for (const binding of matchingEffects(effectiveBindings, attempt, 'before-persist', along)) {
      await this._executeEffect(
        binding,
        change,
        schema,
        attempt,
        skipHookPhases,
        onProgress,
        validity,
      )
    }

    {
      const afterHooks = await this._reconcile.execute({
        name: input.name,
        refreshImplementationTracking: true,
      })
      change = afterHooks.change
      validity = afterHooks.verdict
      if (change.state !== fromState) {
        if (afterHooks.automaticReturn !== null) {
          throw await this._committedRecoveryError(
            input.name,
            change,
            schema,
            afterHooks.automaticReturn,
            afterHooks.verdict,
          )
        }
        throw new InvalidStateTransitionError(change.state, effectiveTarget)
      }
      const rerunCandidate = await evaluateTransitionCandidate({
        change,
        schema,
        approvals: this._approvals,
        target: requestedTarget,
        mode: 'execute',
        baseBindings: this._transitionBindings,
        passMemo: new Map(),
        effectiveStatusByArtifact,
        validity,
        ...(this._checkRegistry !== undefined ? { checkRegistry: this._checkRegistry } : {}),
        ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
        skipChecks: skipChecksList,
      })
      if (!rerunCandidate.allowed) {
        this._throwPredicateFailures(
          rerunCandidate.checks,
          rerunCandidate.bindings,
          fromState,
          effectiveTarget,
          onProgress,
        )
      }
    }

    const { change: persistedChange } = await this._changes.mutate(input.name, (freshChange) => {
      if (SKILL_HOP_SOURCES.has(fromState) && SKILL_HOP_TARGETS.has(effectiveTarget)) {
        freshChange.invalidateSignoff(actor)
      }

      freshChange.transition(effectiveTarget, actor, schema, this._approvals)

      if (effectiveTarget === 'implementing' && !freshChange.isImplementationTrackingActive) {
        freshChange.startImplementationTracking()
      }
    })

    onProgress?.({ type: 'transitioned', from: fromState, to: effectiveTarget })

    return { change: persistedChange }
  }

  /**
   * Runs one matching effect via `check.execute` (no CheckId switch to launch hooks).
   *
   * @param binding - Matching effect row
   * @param change - Change under transition
   * @param schema - Active schema
   * @param attempt - Classified attempt
   * @param skipHookPhases - Skip selectors
   * @param onProgress - Optional progress callback
   * @param validity - Reconciled validity verdict for this transition
   */
  private async _executeEffect(
    binding: CheckBinding,
    change: Change,
    schema: Awaited<ReturnType<SchemaProvider['get']>>,
    attempt: ReturnType<typeof transitionAttemptFor>['attempt'],
    skipHookPhases: readonly string[],
    onProgress?: OnTransitionProgress,
    validity?: ChangeValidityVerdict,
  ): Promise<void> {
    const onCheckProgress: OnCheckProgress | undefined =
      onProgress === undefined ? undefined : (event) => onProgress(event)
    const ctx = buildCheckExecutionContext({
      change,
      schema,
      attempt,
      approvals: this._approvals,
      skipHookPhases,
      ...(this._checkRegistry !== undefined ? { checkRegistry: this._checkRegistry } : {}),
      ...(validity !== undefined ? { validity } : {}),
      ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
    })
    const result = await executeCheckWithProgress(binding.check, ctx)
    if (result.outcome === 'fail' && hookFailureMode(binding.onFailure) === 'fail-fast') {
      throwHookFailed(result)
    }
  }

  /**
   * Throws for failed predicates. An `abort` failure throws one {@link CheckPredicateFailedError};
   * when every failure is `onFailure: 'collect'`, one {@link CheckPredicateFailedError}
   * for the first collected failure lists all of them in `details.failures`.
   *
   * @param checks - Evaluated predicate results
   * @param bindings - Effective bindings used to read each failure policy
   * @param fromState - Source state
   * @param effectiveTarget - Persist target
   * @param onProgress - Optional progress callback
   * @throws {CheckPredicateFailedError} Mapped from the failed checks
   */
  private _throwPredicateFailures(
    checks: readonly CheckResult[],
    bindings: readonly CheckBinding[],
    fromState: ChangeState,
    effectiveTarget: ChangeState,
    onProgress?: OnTransitionProgress,
  ): void {
    const failures = checks.filter((check) => check.outcome === 'fail')
    const first = failures[0]
    if (first === undefined) {
      return
    }
    const collects = (check: CheckResult): boolean =>
      bindings.find((binding) => binding.check.id === check.id)?.onFailure === 'collect'
    const abortFailure = failures.find((check) => !collects(check))
    if (abortFailure !== undefined) {
      this._emitFailureProgress(abortFailure, onProgress)
      const matchingBinding = bindings.find((b) => b.check.id === abortFailure.id)
      throw new CheckPredicateFailedError(
        abortFailure.id,
        abortFailure.label,
        abortFailure.code ?? 'CHECK_FAILED',
        abortFailure.message ?? `Check '${abortFailure.id}' failed`,
        abortFailure.action,
        abortFailure.details,
        matchingBinding?.skippable === true,
        { from: fromState, to: effectiveTarget },
      )
    }

    this._emitFailureProgress(first, onProgress)
    const matchingBinding = bindings.find((binding) => binding.check.id === first.id)
    throw new CheckPredicateFailedError(
      first.id,
      first.label,
      first.code ?? 'CHECK_FAILED',
      first.message ?? `Check '${first.id}' failed`,
      first.action,
      {
        ...first.details,
        failures: failures.map((failure) => ({
          checkId: failure.id,
          label: failure.label,
          code: failure.code ?? 'CHECK_FAILED',
          message: failure.message ?? `Check '${failure.id}' failed`,
          ...(failure.action !== undefined ? { action: failure.action } : {}),
          ...(failure.details !== undefined ? { details: failure.details } : {}),
        })),
      },
      matchingBinding?.skippable === true,
      { from: fromState, to: effectiveTarget },
    )
  }

  /**
   * Emits requires-check events from the evaluated statuses, not a second gate.
   *
   * @param checks - Predicate results
   * @param requires - Target step requires
   * @param artifacts - Lifecycle artifact verdicts
   * @param onProgress - Optional progress callback
   */
  private _emitRequiresProgress(
    checks: readonly CheckResult[],
    requires: readonly string[],
    artifacts: readonly { readonly type: string; readonly effectiveStatus: ArtifactStatus }[],
    onProgress?: OnTransitionProgress,
  ): void {
    const requiresCheck = checks.find((check) => check.id === 'workflow.requires')
    if (requiresCheck === undefined || requiresCheck.outcome === 'skip') {
      return
    }
    for (const artifactId of requires) {
      const verdict = artifacts.find((artifact) => artifact.type === artifactId)
      const status = verdict?.effectiveStatus ?? 'missing'
      const satisfied = status === 'complete' || status === 'skipped'
      onProgress?.({ type: 'requires-check', artifactId, satisfied })
      if (!satisfied) {
        return
      }
    }
  }

  /**
   * Emits task-completion-failed / requires-check for the failing predicate.
   *
   * @param failed - Failed check
   * @param onProgress - Optional progress callback
   */
  private _emitFailureProgress(failed: CheckResult, onProgress?: OnTransitionProgress): void {
    if (failed.id === 'workflow.requires') {
      const artifactId = detailString(failed.details, 'artifactId')
      if (artifactId !== undefined) {
        onProgress?.({ type: 'requires-check', artifactId, satisfied: false })
      }
      return
    }
    if (
      failed.id === 'workflow.taskCompletion' &&
      detailString(failed.details, 'reason') !== 'missing-task-capability'
    ) {
      const artifactId = detailString(failed.details, 'artifactId')
      if (artifactId !== undefined) {
        onProgress?.({
          type: 'task-completion-failed',
          artifactId,
          incomplete: detailNumber(failed.details, 'incomplete') ?? 0,
          complete: detailNumber(failed.details, 'complete') ?? 0,
          total: detailNumber(failed.details, 'total') ?? 0,
        })
      }
    }
  }

  /**
   * Builds a {@link ReconciledOperationBlockedError} from the recovered state's evaluated
   * forward checks so `nextAction` carries check-declared remediation actions.
   *
   * @param changeName - Reconciled change name
   * @param change - Change as persisted after recovery
   * @param schema - Change schema, used to route the next action through the topology
   * @param recovery - Recovery committed by the reconciler
   * @param verdict - Canonical post-recovery validity verdict
   * @returns Typed error carrying repair guidance
   */
  private async _committedRecoveryError(
    changeName: string,
    change: Change,
    schema: Awaited<ReturnType<SchemaProvider['get']>>,
    recovery: AutomaticRecovery,
    verdict: ChangeValidityVerdict,
  ): Promise<ReconciledOperationBlockedError> {
    const effectiveStatusByArtifact = toEffectiveStatusMap(projectArtifacts(change, schema))
    const legalTargets = await evaluateLegalTargets(this._transitionBindings, {
      change,
      schema,
      approvals: this._approvals,
      effectiveStatusByArtifact,
      validity: verdict,
      ...(this._checkRegistry !== undefined ? { checkRegistry: this._checkRegistry } : {}),
    })
    const lifecycle = evaluateLifecycle(change, schema, {
      approvals: this._approvals,
      validity: verdict,
      checksByTarget: legalTargets.checksByTarget,
      bindingsByTarget: legalTargets.bindingsByTarget,
    })
    const nextAction: NextAction = {
      ...lifecycle.nextAction,
      reason: `Validity reconciliation returned the change to ${recovery.to}`,
    }
    return new ReconciledOperationBlockedError({
      operation: 'transition',
      changeName,
      state: change.state,
      automaticReturn: recovery,
      blockers: verdict.blockers,
      nextAction,
    })
  }
}

/**
 * Builds an effective-status map from a lifecycle verdict.
 *
 * @param artifacts - Verdict artifacts
 * @returns Map keyed by artifact id
 */
function toEffectiveStatusMap(
  artifacts: readonly { readonly type: string; readonly effectiveStatus: ArtifactStatus }[],
): ReadonlyMap<string, ArtifactStatus> {
  return new Map(artifacts.map((artifact) => [artifact.type, artifact.effectiveStatus]))
}

/**
 * Reads a string detail from a check result.
 *
 * @param details - Check details
 * @param key - Detail key
 * @returns String value, or undefined
 */
function detailString(
  details: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = details?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Reads a number detail from a check result.
 *
 * @param details - Check details
 * @param key - Detail key
 * @returns Number value, or undefined
 */
function detailNumber(
  details: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | undefined {
  const value = details?.[key]
  return typeof value === 'number' ? value : undefined
}
