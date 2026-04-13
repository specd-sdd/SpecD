import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { HookFailedError } from '../../domain/errors/hook-failed-error.js'
import { safeRegex } from '../../domain/services/safe-regex.js'
import { type RunStepHooks, type OnHookProgress } from './run-step-hooks.js'

/** Selectors for granular hook phase skipping during transitions. */
export type HookPhaseSelector = 'source.pre' | 'source.post' | 'target.pre' | 'target.post' | 'all'

/** Input for the {@link TransitionChange} use case. */
export interface TransitionChangeInput {
  /** The change to transition. */
  readonly name: string
  /**
   * The requested target state.
   *
   * Smart routing applies at two decision points:
   * - `'implementing'` requested from `ready`: routes to `pending-spec-approval`
   *   when `approvalsSpec` is `true`.
   * - `'archivable'` requested from `done`: routes to `pending-signoff` when
   *   `approvalsSignoff` is `true`.
   *
   * All other states are transitioned directly.
   */
  readonly to: ChangeState
  /**
   * Whether the spec approval gate is enabled in the active configuration.
   *
   * When `true` and the change is in `ready` state transitioning toward
   * `implementing`, the actual target is routed to `pending-spec-approval`.
   */
  readonly approvalsSpec: boolean
  /**
   * Whether the signoff gate is enabled in the active configuration.
   *
   * When `true` and the change is in `done` state transitioning toward
   * `archivable`, the actual target is routed to `pending-signoff`.
   */
  readonly approvalsSignoff: boolean
  /**
   * Which hook phases to skip during the transition. Valid selectors:
   * `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`.
   *
   * When `'all'` is in the set, all hooks are skipped. When empty (default),
   * all applicable hooks execute. The caller is responsible for invoking
   * skipped hooks separately via `RunStepHooks`.
   */
  readonly skipHookPhases?: ReadonlySet<HookPhaseSelector>
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

  /**
   * Creates a new `TransitionChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param runStepHooks - Use case for executing workflow hooks
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    runStepHooks: RunStepHooks,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._runStepHooks = runStepHooks
  }

  /**
   * Executes the use case.
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

    const actor = await this._actor.identity()
    const fromState = change.state
    const effectiveTarget = this._resolveTarget(change.state, input)

    if (
      fromState === 'ready' &&
      effectiveTarget === 'pending-spec-approval' &&
      !input.approvalsSpec
    ) {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'gate-not-required',
        gate: 'spec',
      })
    }

    if (fromState === 'done' && effectiveTarget === 'pending-signoff' && !input.approvalsSignoff) {
      throw new InvalidStateTransitionError(fromState, effectiveTarget, {
        type: 'gate-not-required',
        gate: 'signoff',
      })
    }

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

    // --- Resolve schema and workflow step ---
    const schema = await this._schemaProvider.get()
    const workflowStep = schema.workflowStep(effectiveTarget) ?? null

    // --- Enforce workflow requires ---
    if (workflowStep !== null && workflowStep.requires.length > 0) {
      for (const artifactId of workflowStep.requires) {
        const status = change.effectiveStatus(artifactId)
        const satisfied = status === 'complete' || status === 'skipped'
        onProgress?.({ type: 'requires-check', artifactId, satisfied })
        if (!satisfied) {
          throw new InvalidStateTransitionError(change.state, effectiveTarget, {
            type: 'incomplete-artifact',
            artifactId,
          })
        }
      }
    }

    // --- Task completion gating (requiresTaskCompletion) ---
    if (workflowStep !== null && workflowStep.requiresTaskCompletion.length > 0) {
      for (const artifactId of workflowStep.requiresTaskCompletion) {
        const artifactType = schema.artifact(artifactId)
        if (artifactType?.taskCompletionCheck === undefined) continue
        await this._checkTaskCompletionForArtifact(
          change,
          artifactId,
          artifactType.taskCompletionCheck,
          effectiveTarget,
          onProgress,
        )
      }
    }

    // --- Hook phase skip resolution ---
    const skip = input.skipHookPhases ?? new Set<HookPhaseSelector>()
    const skipAll = skip.has('all')

    // --- Source post-hooks (fail-fast) — finishing the previous step ---
    const fromWorkflowStep = schema?.workflowStep(fromState) ?? null
    if (!skipAll && !skip.has('source.post') && fromWorkflowStep !== null) {
      await this._executeHooks(input.name, fromState, 'post', onProgress)
    }

    // --- Target pre-hooks (fail-fast) — preparing the new step ---
    if (!skipAll && !skip.has('target.pre') && workflowStep !== null) {
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
      onProgress?.({ ...evt, phase } as TransitionProgressEvent)
    }
    const result = await this._runStepHooks.execute({ name, step, phase }, hookProgress)
    if (!result.success && result.failedHook !== null) {
      throw new HookFailedError(
        result.failedHook.command,
        result.failedHook.exitCode,
        result.failedHook.stderr,
      )
    }
  }

  /**
   * Checks all files in an artifact for incomplete task items, counting matches
   * and emitting a progress event before throwing.
   *
   * @param change - The change whose artifact files are checked
   * @param artifactId - The artifact type ID to check
   * @param taskCheck - The task completion check config from the artifact type
   * @param taskCheck.incompletePattern - Regex pattern for incomplete task items
   * @param taskCheck.completePattern - Optional regex pattern for complete task items (used for counting)
   * @param effectiveTarget - The target state (for error context)
   * @param onProgress - Optional progress callback
   * @throws {InvalidStateTransitionError} If any file contains incomplete task items
   */
  private async _checkTaskCompletionForArtifact(
    change: Change,
    artifactId: string,
    taskCheck: { readonly incompletePattern?: string; readonly completePattern?: string },
    effectiveTarget: ChangeState,
    onProgress?: OnTransitionProgress,
  ): Promise<void> {
    if (taskCheck.incompletePattern === undefined) return

    const changeArtifact = change.getArtifact(artifactId)
    if (changeArtifact === null) return

    const incompleteRe = safeRegex(taskCheck.incompletePattern, 'gm')
    if (incompleteRe === null) return

    const completeRe =
      taskCheck.completePattern !== undefined ? safeRegex(taskCheck.completePattern, 'gm') : null

    let incompleteCount = 0
    let completeCount = 0

    for (const file of changeArtifact.files.values()) {
      const loaded = await this._changes.artifact(change, file.filename)
      if (loaded === null) continue

      incompleteCount += (loaded.content.match(incompleteRe) ?? []).length
      if (completeRe !== null) {
        completeCount += (loaded.content.match(completeRe) ?? []).length
      }
    }

    if (incompleteCount > 0) {
      const total = incompleteCount + completeCount
      onProgress?.({
        type: 'task-completion-failed',
        artifactId,
        incomplete: incompleteCount,
        complete: completeCount,
        total,
      })
      throw new InvalidStateTransitionError(change.state, effectiveTarget, {
        type: 'incomplete-tasks',
        artifactId,
        incomplete: incompleteCount,
        complete: completeCount,
        total,
      })
    }
  }

  /**
   * Resolves the actual target state after applying approval-gate routing.
   *
   * @param currentState - The change's current lifecycle state
   * @param input - The use case input containing routing flags
   * @returns The effective target state to transition to
   */
  private _resolveTarget(currentState: ChangeState, input: TransitionChangeInput): ChangeState {
    if (currentState === 'ready' && input.to === 'implementing' && input.approvalsSpec) {
      return 'pending-spec-approval'
    }
    if (currentState === 'done' && input.to === 'archivable' && input.approvalsSignoff) {
      return 'pending-signoff'
    }
    return input.to
  }
}
