import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { HookFailedError } from '../../domain/errors/hook-failed-error.js'
import { LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import { CountTasks } from './count-tasks.js'
import { type RunStepHooks, type OnHookProgress } from './run-step-hooks.js'
import { RefreshImplementationTracking } from './refresh-implementation-tracking.js'
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
   * The requested target state.
   *
   * Smart routing applies at two decision points when gates are active at construction:
   * - `'implementing'` requested from `ready`: routes to `pending-spec-approval`
   *   when the spec gate is enabled.
   * - `'archivable'` requested from `done`: routes to `pending-signoff` when
   *   the signoff gate is enabled.
   *
   * All other states are transitioned directly.
   */
  readonly to: ChangeState
  /**
   * Which hook phases to skip during the transition. Valid selectors:
   * `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`.
   *
   * When `'all'` is in the set, all hooks are skipped. When empty (default),
   * all applicable hooks execute. The caller is responsible for invoking
   * skipped hooks separately via `RunStepHooks`.
   */
  readonly skipHookPhases?: ReadonlySet<HookPhaseSelector>
  /**
   * When omitted or `true`, refresh tracked implementation files before
   * transition for active changes only. When `false`, skip refresh.
   */
  readonly refreshImplementationTrackingBefore?: boolean
}

/** Progress event emitted during a transition. */
export type TransitionProgressEvent =
  | { type: 'requires-check'; artifactId: string; satisfied: boolean }
  | {
      type: 'task-completion-failed'
      artifactId: string
      incomplete: number
      complete: number
      total: number
    }
  | { type: 'hook-start'; phase: 'pre' | 'post'; hookId: string; command: string }
  | {
      type: 'hook-output'
      phase: 'pre' | 'post'
      hookId: string
      stream: 'stdout' | 'stderr'
      line: string
    }
  | { type: 'hook-heartbeat'; phase: 'pre' | 'post'; hookId: string; elapsedMs: number }
  | { type: 'hook-done'; phase: 'pre' | 'post'; hookId: string; success: boolean; exitCode: number }
  | { type: 'transitioned'; from: ChangeState; to: ChangeState }

/** Callback for receiving transition progress events. */
export type OnTransitionProgress = (event: TransitionProgressEvent) => void

/** Result returned by {@link TransitionChange}. */
export interface TransitionChangeResult {
  /** The updated change after the transition. */
  readonly change: Change
}

/**
 * Performs a lifecycle state transition on a change with approval-gate routing,
 * workflow requires enforcement, task completion gating, and hook execution.
 *
 * Handles the two smart-routing decision points:
 * - `ready → implementing` is redirected to `ready → pending-spec-approval`
 *   when the spec approval gate is active.
 * - `done → archivable` is redirected to `done → pending-signoff` when the
 *   signoff gate is active.
 *
 * When the target step declares `requiresTaskCompletion`, each listed artifact
 * is content-checked for incomplete items. This is controlled per-step, not
 * globally for all artifacts with `taskCompletionCheck`.
 *
 * Enforces workflow `requires` for the target step and executes `run:` hooks
 * at step boundaries (unless skipped via `skipHookPhases`).
 */
export class TransitionChange {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _runStepHooks: RunStepHooks
  private readonly _refresh: RefreshImplementationTracking
  private readonly _approvals: ApprovalGates
  private readonly _lifecycle: LifecycleEngine
  private readonly _countTasks: CountTasks

  /**
   * Creates a new `TransitionChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param runStepHooks - Use case for executing workflow hooks
   * @param refreshImplementationTracking - Primitive for optional pre-transition refresh
   * @param approvals - Whether approval gates are active in the project configuration
   * @param lifecycle - Shared lifecycle interpreter
   * @param countTasks - Shared task-completion query
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    runStepHooks: RunStepHooks,
    refreshImplementationTracking: RefreshImplementationTracking,
    approvals: ApprovalGates,
    lifecycle: LifecycleEngine,
    countTasks: CountTasks,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._runStepHooks = runStepHooks
    this._refresh = refreshImplementationTracking
    this._approvals = approvals
    this._lifecycle = lifecycle
    this._countTasks = countTasks
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
   * @throws {HookFailedError} If a source.post or target.pre hook exits with a non-zero code
   */
  async execute(
    input: TransitionChangeInput,
    onProgress?: OnTransitionProgress,
  ): Promise<TransitionChangeResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    if (input.refreshImplementationTrackingBefore !== false) {
      await this._refresh.execute({ name: input.name })
    }

    const actor = await this._actor.identity()
    const fromState = change.state

    // --- Resolve schema and workflow step ---
    const schema = await this._schemaProvider.get()
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      requestedTarget: input.to,
      approvals: this._approvals,
    })
    const effectiveTarget = lifecycle.effectiveTarget ?? input.to
    const workflowStep = schema.workflowStep(effectiveTarget) ?? null

    Logger.debug('TransitionChange projected lifecycle engine routing', {
      change: change.name,
      fromState,
      requestedTarget: input.to,
      effectiveTarget,
      blockerCodes: lifecycle.blockers.map((blocker) => blocker.code),
    })

    if (fromState === 'pending-spec-approval' && effectiveTarget !== 'designing') {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'approval-required',
        gate: 'spec',
      })
    }

    if (fromState === 'pending-signoff' && effectiveTarget !== 'designing') {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'approval-required',
        gate: 'signoff',
      })
    }

    if (
      (input.to === 'pending-spec-approval' || input.to === 'spec-approved') &&
      !this._approvals.spec
    ) {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'gate-not-required',
        gate: 'spec',
      })
    }

    if ((input.to === 'pending-signoff' || input.to === 'signed-off') && !this._approvals.signoff) {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'gate-not-required',
        gate: 'signoff',
      })
    }

    if (lifecycle.blockers.some((blocker) => blocker.code === 'INVALID_TRANSITION')) {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'invalid-transition',
      })
    }

    const isArchivingRecovery = fromState === 'archiving' && effectiveTarget === 'archivable'

    // --- Enforce workflow requires ---
    if (!isArchivingRecovery && workflowStep !== null && workflowStep.requires.length > 0) {
      for (const artifactId of workflowStep.requires) {
        const verdict = lifecycle.artifacts.find((artifact) => artifact.type === artifactId)
        const status = verdict?.effectiveStatus ?? 'missing'
        const satisfied = status === 'complete' || status === 'skipped'
        onProgress?.({ type: 'requires-check', artifactId, satisfied })
        if (!satisfied) {
          const blockedBy = this._lifecycle.findBlockingParent(change, schema, artifactId)
          throw new InvalidStateTransitionError(change.state, effectiveTarget, {
            type: 'incomplete-artifact',
            artifactId,
            status,
            ...(blockedBy !== null ? { blockedBy } : {}),
          })
        }
      }
    }

    // --- Task completion gating (requiresTaskCompletion) ---
    if (
      !isArchivingRecovery &&
      workflowStep !== null &&
      workflowStep.requiresTaskCompletion.length > 0
    ) {
      const taskCounts = await this._countTasks.execute({ change })
      for (const artifactId of workflowStep.requiresTaskCompletion) {
        const artifactType = schema.artifact(artifactId)

        // Defensive check: invariant violation
        if (
          artifactType === null ||
          !artifactType.hasTasks ||
          artifactType.taskCompletionCheck === undefined
        ) {
          throw new InvalidStateTransitionError(fromState, effectiveTarget, {
            type: 'missing-task-capability',
            artifactId,
          })
        }

        const count = taskCounts.byArtifact[artifactId]
        if (count?.incomplete !== undefined && count.incomplete > 0) {
          onProgress?.({ type: 'task-completion-failed', artifactId, ...count })
          throw new InvalidStateTransitionError(change.state, effectiveTarget, {
            type: 'incomplete-tasks',
            artifactId,
            ...count,
          })
        }
      }
    }

    // --- Hook phase skip resolution ---
    const skip = input.skipHookPhases ?? new Set<HookPhaseSelector>()
    const skipAll = skip.has('all')

    // --- Source post-hooks (fail-fast) — finishing the previous step ---
    const fromWorkflowStep = schema?.workflowStep(fromState) ?? null
    if (!isArchivingRecovery && !skipAll && !skip.has('source.post') && fromWorkflowStep !== null) {
      await this._executeHooks(input.name, fromState, 'post', onProgress)
    }

    // --- Target pre-hooks (fail-fast) — preparing the new step ---
    if (!isArchivingRecovery && !skipAll && !skip.has('target.pre') && workflowStep !== null) {
      await this._executeHooks(input.name, effectiveTarget, 'pre', onProgress)
    }

    const persistedChange = await this._changes.mutate(input.name, (freshChange) => {
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

      if (!invalidated) {
        freshChange.transition(effectiveTarget, actor)
      }

      return freshChange
    })

    onProgress?.({ type: 'transitioned', from: fromState, to: effectiveTarget })

    return { change: persistedChange }
  }

  /**
   * Executes hooks for a workflow step. Throws on failure (fail-fast).
   *
   * @param name - The change name
   * @param step - The workflow step
   * @param phase - The hook phase ('pre' or 'post')
   * @param onProgress - Optional progress callback
   */
  private async _executeHooks(
    name: string,
    step: ChangeState,
    phase: 'pre' | 'post',
    onProgress?: OnTransitionProgress,
  ): Promise<void> {
    const hookProgress: OnHookProgress = (evt) => {
      switch (evt.type) {
        case 'hook-start':
        case 'hook-output':
        case 'hook-heartbeat':
        case 'hook-done':
          onProgress?.({ ...evt, phase })
          break
      }
    }
    const result = await this._runStepHooks.execute({ name, step, phase }, hookProgress)
    const failedHook = result.failedHooks[0]
    if (!result.success && failedHook !== undefined) {
      throw new HookFailedError(failedHook.command, failedHook.exitCode, failedHook.stderr)
    }
  }
}
