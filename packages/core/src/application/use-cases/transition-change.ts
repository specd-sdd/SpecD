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
 * During requires enforcement, any required artifact whose type declares a
 * `taskCompletionCheck` is content-checked for incomplete items. This applies
 * to all transitions, not just `implementing → verifying`.
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

    // --- Resolve schema and workflow step ---
    const schema = await this._schemaProvider.get()
    const workflowStep = schema.workflowStep(effectiveTarget) ?? null

    // --- Enforce workflow requires and task completion gating ---
    if (workflowStep !== null && workflowStep.requires.length > 0) {
      for (const artifactId of workflowStep.requires) {
        const status = change.effectiveStatus(artifactId)
        const satisfied = status === 'complete' || status === 'skipped'
        onProgress?.({ type: 'requires-check', artifactId, satisfied })
        if (!satisfied) {
          throw new InvalidStateTransitionError(change.state, effectiveTarget)
        }

        // Task completion gating: check content for incomplete items
        const artifactType = schema.artifact(artifactId)
        const pattern = artifactType?.taskCompletionCheck?.incompletePattern
        if (pattern !== undefined) {
          await this._checkTaskCompletionForArtifact(change, artifactId, pattern, effectiveTarget)
        }
      }
    }

    // --- Artifact validation clearing (verifying → implementing) ---
    if (change.state === 'verifying' && effectiveTarget === 'implementing') {
      const implementingStep = schema.workflowStep('implementing')
      if (implementingStep !== null) {
        change.clearArtifactValidations(implementingStep.requires)
      }
    }

    // --- Approval invalidation on transition to designing ---
    let invalidated = false
    if (effectiveTarget === 'designing' && change.state !== 'drafting') {
      if (change.activeSpecApproval !== undefined || change.activeSignoff !== undefined) {
        change.invalidate('redesign', actor)
        invalidated = true
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

    // --- State transition (skip if invalidate() already moved to designing) ---
    if (!invalidated) {
      change.transition(effectiveTarget, actor)
    }
    await this._changes.save(change)
    onProgress?.({ type: 'transitioned', from: fromState, to: effectiveTarget })

    return { change }
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
   * Checks all files in an artifact for incomplete task items.
   *
   * @param change - The change whose artifact files are checked
   * @param artifactId - The artifact type ID to check
   * @param incompletePattern - Regex pattern for incomplete task items
   * @param effectiveTarget - The target state (for error context)
   * @throws {InvalidStateTransitionError} If any file contains incomplete task items
   */
  private async _checkTaskCompletionForArtifact(
    change: Change,
    artifactId: string,
    incompletePattern: string,
    effectiveTarget: ChangeState,
  ): Promise<void> {
    const changeArtifact = change.getArtifact(artifactId)
    if (changeArtifact === null) return

    const re = safeRegex(incompletePattern, 'm')
    if (re === null) return

    for (const file of changeArtifact.files.values()) {
      const loaded = await this._changes.artifact(change, file.filename)
      if (loaded === null) continue

      if (re.test(loaded.content)) {
        throw new InvalidStateTransitionError(change.state, effectiveTarget)
      }
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
