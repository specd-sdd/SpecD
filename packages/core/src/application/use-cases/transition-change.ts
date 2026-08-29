import { type Change } from '../../domain/entities/change.js'
import { type ChangeState, HAPPY_PATH_NEXT } from '../../domain/value-objects/change-state.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { HappyPathNextUnavailableError } from '../../domain/errors/happy-path-next-unavailable-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { ArchiveDependencyMismatchError } from '../../domain/errors/archive-dependency-mismatch-error.js'
import { ArchiveImplementationStateError } from '../../domain/errors/archive-implementation-state-error.js'
import { findBlockingParent, projectArtifacts } from '../../domain/services/lifecycle-verdict.js'
import { evaluateLifecycle } from '../services/lifecycle-evaluation.js'
import {
  type CheckBinding,
  type CheckProgressEvent,
  type CheckResult,
  type OnCheckProgress,
} from '../../domain/services/transition-checks.js'
import { hookFailureMode, matchingEffects } from '../services/execute-hook-effect.js'
import {
  buildCheckExecutionContext,
  executeCheckWithProgress,
  executeMatchingPredicates,
  transitionAttemptFor,
} from '../services/execute-matching-predicates.js'
import { throwHookFailed } from '../checks/hook-failed.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import { Logger } from '../logger.js'

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
   * When omitted or `true`, refresh tracked implementation files before
   * transition for active changes only. When `false`, skip refresh.
   */
  readonly refreshImplementationTrackingBefore?: boolean
  /**
   * When `true`, `impl.linksInScope` is skippable (same semantics as archive).
   * Defaults to `false`.
   */
  readonly allowOutOfScope?: boolean
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
 * Pending parking states are drain-only for in-flight changes.
 *
 * Predicates and effects run via composed `Check` instances (`execute(ctx)`).
 * `skipHookPhases` skips effects only — predicates still run.
 * `source.post` runs only when `along === 'forward'` (binding applicability).
 */
export class TransitionChange {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _refresh: RefreshImplementationTracking
  private readonly _approvals: ApprovalGates
  private readonly _transitionBindings: readonly CheckBinding[]

  /**
   * Creates a new `TransitionChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param refreshImplementationTracking - Primitive for optional pre-transition refresh
   * @param approvals - Whether approval gates are active in the project configuration
   * @param transitionBindings - Composed transition check bindings
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    refreshImplementationTracking: RefreshImplementationTracking,
    approvals: ApprovalGates,
    transitionBindings: readonly CheckBinding[],
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._refresh = refreshImplementationTracking
    this._approvals = approvals
    this._transitionBindings = transitionBindings
  }

  /**
   * Executes the use case.
   *
   * When `refreshImplementationTrackingBefore` is not `false`, active changes
   * are refreshed before lifecycle evaluation and mutation.
   *
   * @param input - Transition parameters
   * @param onProgress - Optional callback for progress events
   * @returns The transition result with the updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the transition is not permitted, requires are unsatisfied, or incomplete tasks remain
   * @throws {ReadOnlyWorkspaceError} If enter-ready fails `workspace.readOnly`
   * @throws {ArchiveDependencyMismatchError} If enter-ready fails `deps.consistent`
   * @throws {ArchiveImplementationStateError} If exit-implementing fails `impl.*`
   * @throws {HookFailedError} If a source.post or target.pre hook exits with a non-zero code
   */
  async execute(
    input: TransitionChangeInput,
    onProgress?: OnTransitionProgress,
  ): Promise<TransitionChangeResult> {
    let change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    if (input.refreshImplementationTrackingBefore !== false) {
      await this._refresh.execute({ name: input.name })
      const reloaded = await this._changes.get(input.name)
      if (reloaded === null) {
        throw new ChangeNotFoundError(input.name)
      }
      change = reloaded
    }

    const actor = await this._actor.identity()
    const fromState = change.state
    let requestedTarget: ChangeState
    if (input.to === 'next') {
      const next = HAPPY_PATH_NEXT[fromState]
      if (next === undefined) {
        throw new HappyPathNextUnavailableError(fromState)
      }
      requestedTarget = next
    } else {
      requestedTarget = input.to
    }
    const allowOutOfScope = input.allowOutOfScope === true

    const schema = await this._schemaProvider.get()
    const projectedArtifacts = projectArtifacts(change, schema)
    const effectiveStatusByArtifact = toEffectiveStatusMap(projectedArtifacts)
    const { attempt, along } = transitionAttemptFor(fromState, requestedTarget, schema)
    const skip = input.skipHookPhases ?? new Set<HookPhaseSelector>()
    const skipHookPhases = [...skip]
    const onCheckProgress: OnCheckProgress | undefined =
      onProgress === undefined ? undefined : (event) => onProgress(event)
    const passMemo = new Map<string, unknown>()
    const evaluation = await executeMatchingPredicates(
      this._transitionBindings,
      buildCheckExecutionContext({
        change,
        schema,
        attempt,
        approvals: this._approvals,
        allowOutOfScope,
        skipHookPhases,
        effectiveStatusByArtifact,
        passMemo,
        ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
      }),
      { failFastOn: 'protocol.edge' },
    )
    const effectiveTarget = requestedTarget
    const workflowStep = schema.workflowStep(effectiveTarget) ?? null
    const lifecycle = evaluateLifecycle(change, schema, {
      requestedTarget,
      approvals: this._approvals,
      checksByTarget: { [requestedTarget]: evaluation.checks },
    })

    Logger.debug('TransitionChange projected evaluateLifecycle routing', {
      change: change.name,
      fromState,
      requestedTarget,
      effectiveTarget,
      along,
      allowed: evaluation.allowed,
      blockerCodes: lifecycle.blockers.map((blocker) => blocker.code),
    })

    this._assertDrainAndGateTargets(fromState, requestedTarget)

    if (!evaluation.allowed) {
      const failed = evaluation.checks.find((check) => check.outcome === 'fail')
      if (failed !== undefined) {
        this._emitFailureProgress(failed, onProgress)
        this._mapFailedPredicate(failed, fromState, effectiveTarget, change, schema)
      }
    }

    this._emitRequiresProgress(
      evaluation.checks,
      workflowStep?.requires ?? [],
      lifecycle.artifacts,
      onProgress,
    )

    for (const binding of matchingEffects(
      this._transitionBindings,
      attempt,
      'before-persist',
      along,
    )) {
      await this._executeEffect(binding, change, schema, attempt, skipHookPhases, onProgress)
    }

    const { change: persistedChange } = await this._changes.mutate(input.name, (freshChange) => {
      let invalidated = false

      if (
        effectiveTarget === 'designing' &&
        freshChange.state !== 'drafting' &&
        freshChange.state !== 'designing'
      ) {
        freshChange.invalidate(
          'artifact-review-required',
          actor,
          'Invalidated because the change returned to designing and all artifacts require review.',
          [...freshChange.artifacts.values()].map((artifact) => ({
            type: artifact.type,
            files: [...artifact.files.keys()],
          })),
          schema.artifactDag(),
        )
        invalidated = true
      }

      if (SKILL_HOP_SOURCES.has(fromState) && SKILL_HOP_TARGETS.has(effectiveTarget)) {
        freshChange.invalidateSignoff(actor)
      }

      if (!invalidated) {
        freshChange.transition(effectiveTarget, actor)
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
   */
  private async _executeEffect(
    binding: CheckBinding,
    change: Change,
    schema: Awaited<ReturnType<SchemaProvider['get']>>,
    attempt: ReturnType<typeof transitionAttemptFor>['attempt'],
    skipHookPhases: readonly string[],
    onProgress?: OnTransitionProgress,
  ): Promise<void> {
    const onCheckProgress: OnCheckProgress | undefined =
      onProgress === undefined ? undefined : (event) => onProgress(event)
    const ctx = buildCheckExecutionContext({
      change,
      schema,
      attempt,
      approvals: this._approvals,
      skipHookPhases,
      ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
    })
    const result = await executeCheckWithProgress(binding.check, ctx)
    if (result.outcome === 'fail' && hookFailureMode(binding.onFailure) === 'fail-fast') {
      throwHookFailed(result)
    }
  }

  /**
   * Drain-only pending hops and gate-not-required for new pending targets.
   *
   * @param fromState - Current state
   * @param requestedTarget - Requested persist target
   * @throws InvalidStateTransitionError when the hop is not a drain-only pending hop
   */
  private _assertDrainAndGateTargets(fromState: ChangeState, requestedTarget: ChangeState): void {
    const isSpecDrain =
      fromState === 'pending-spec-approval' &&
      (requestedTarget === 'designing' || requestedTarget === 'spec-approved')
    const isSignoffDrain =
      fromState === 'pending-signoff' &&
      (requestedTarget === 'designing' || requestedTarget === 'signed-off')

    if (
      (requestedTarget === 'pending-spec-approval' || requestedTarget === 'spec-approved') &&
      !this._approvals.spec &&
      !isSpecDrain
    ) {
      throw new InvalidStateTransitionError(fromState, requestedTarget, {
        type: 'gate-not-required',
        gate: 'spec',
      })
    }

    if (
      (requestedTarget === 'pending-signoff' || requestedTarget === 'signed-off') &&
      !this._approvals.signoff &&
      !isSignoffDrain
    ) {
      throw new InvalidStateTransitionError(fromState, requestedTarget, {
        type: 'gate-not-required',
        gate: 'signoff',
      })
    }
  }

  /**
   * Maps the first failed predicate to the existing typed error.
   *
   * @param failed - Failed check
   * @param fromState - Source state
   * @param effectiveTarget - Persist target
   * @param change - Change under evaluation
   * @param schema - Active schema
   * @throws SpecdError mapped from the failed check id
   * @returns Never; always throws
   */
  private _mapFailedPredicate(
    failed: CheckResult,
    fromState: ChangeState,
    effectiveTarget: ChangeState,
    change: Change,
    schema: Awaited<ReturnType<SchemaProvider['get']>>,
  ): never {
    switch (failed.id) {
      case 'protocol.edge':
        throw new InvalidStateTransitionError(fromState, effectiveTarget, {
          type: 'invalid-transition',
        })
      case 'workflow.requires': {
        const artifactId = detailString(failed.details, 'artifactId') ?? 'unknown'
        const status = detailString(failed.details, 'status')
        const blockedBy =
          status === 'pending-parent-artifact-review'
            ? findBlockingParent(change, schema, artifactId)
            : null
        throw new InvalidStateTransitionError(fromState, effectiveTarget, {
          type: 'incomplete-artifact',
          artifactId,
          ...(status !== undefined ? { status } : {}),
          ...(blockedBy !== null ? { blockedBy } : {}),
        })
      }
      case 'workflow.taskCompletion': {
        const artifactId = detailString(failed.details, 'artifactId') ?? 'unknown'
        if (detailString(failed.details, 'reason') === 'missing-task-capability') {
          throw new InvalidStateTransitionError(fromState, effectiveTarget, {
            type: 'missing-task-capability',
            artifactId,
          })
        }
        throw new InvalidStateTransitionError(fromState, effectiveTarget, {
          type: 'incomplete-tasks',
          artifactId,
          incomplete: detailNumber(failed.details, 'incomplete') ?? 0,
          complete: detailNumber(failed.details, 'complete') ?? 0,
          total: detailNumber(failed.details, 'total') ?? 0,
        })
      }
      case 'approval.spec':
      case 'approval.signoff': {
        const gate = failed.id === 'approval.spec' ? 'spec' : 'signoff'
        throw new InvalidStateTransitionError(fromState, effectiveTarget, {
          type: 'approval-required',
          gate,
        })
      }
      case 'deps.consistent': {
        const mismatches = Array.isArray(failed.details?.mismatches)
          ? (failed.details.mismatches as readonly {
              readonly specId: string
              readonly extracted: readonly string[]
              readonly persisted: readonly string[]
            }[])
          : []
        const first = mismatches[0]
        if (first !== undefined) {
          throw new ArchiveDependencyMismatchError(
            first.specId,
            [...first.persisted],
            [...first.extracted],
          )
        }
        const specIds = detailStringArray(failed.details, 'specIds')
        const specId = specIds[0] ?? 'unknown'
        throw new ArchiveDependencyMismatchError(specId, [], [])
      }
      case 'workspace.readOnly':
        throw new ReadOnlyWorkspaceError(
          failed.message ?? `Change contains specs from readOnly workspaces`,
        )
      case 'impl.filesResolved':
      case 'impl.linksInScope': {
        const files = detailStringArray(failed.details, 'files')
        throw new ArchiveImplementationStateError(
          [...files],
          failed.message ?? 'Implementation state invalid',
        )
      }
      default:
        throw new InvalidStateTransitionError(fromState, effectiveTarget, {
          type: 'invalid-transition',
        })
    }
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

/**
 * Reads a string-array detail from a check result.
 *
 * @param details - Check details
 * @param key - Detail key
 * @returns String array
 */
function detailStringArray(
  details: Readonly<Record<string, unknown>> | undefined,
  key: string,
): readonly string[] {
  const value = details?.[key]
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string')
}
