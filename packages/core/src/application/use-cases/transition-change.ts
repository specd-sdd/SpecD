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

/** A single task completion check for the `implementing → verifying` transition. */
export interface TaskCompletionCheck {
  /**
   * The artifact type ID to check (e.g. `'tasks'`).
   * Used only for error context; the actual check reads the file by `filename`.
   */
  readonly artifactId: string
  /** Filename of the artifact file within the change directory (e.g. `'tasks.md'`). */
  readonly filename: string
  /**
   * Regex pattern matched against the artifact content line-by-line.
   * Defaults to `^\s*-\s+\[ \]` (markdown unchecked checkbox) if not declared in schema.
   * If any line matches, the transition is blocked.
   */
  readonly incompletePattern: string
}

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
   * Artifact IDs whose validation is cleared when transitioning
   * `verifying → implementing`.
   *
   * Should be the `requires` list of the schema's `implementing` workflow step.
   * Ignored on all other transitions.
   */
  readonly implementingRequires?: readonly string[]
  /**
   * Task completion checks performed before allowing `implementing → verifying`.
   *
   * Each entry names an artifact file and the regex pattern for incomplete tasks.
   * If any artifact file contains a line matching its pattern, the transition
   * throws `InvalidStateTransitionError`. This is a content-level check on the
   * artifact files, not a check on `effectiveStatus`.
   *
   * Derived by the caller from the `implementing` workflow step's `requires` list
   * combined with each artifact's `taskCompletionCheck.incompletePattern` (defaulting
   * to `^\s*-\s+\[ \]` when not declared in the schema).
   *
   * Ignored on all other transitions.
   */
  readonly implementingTaskChecks?: ReadonlyArray<TaskCompletionCheck>
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
 * workflow requires enforcement, and hook execution.
 *
 * Handles the two smart-routing decision points:
 * - `ready → implementing` is redirected to `ready → pending-spec-approval`
 *   when the spec approval gate is active.
 * - `done → archivable` is redirected to `done → pending-signoff` when the
 *   signoff gate is active.
 *
 * When transitioning `implementing → verifying`, checks each artifact listed
 * in `implementingTaskChecks` for incomplete task items. Throws
 * `InvalidStateTransitionError` if any incomplete item is found.
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

    // --- Resolve schema and workflow step (best-effort) ---
    const schema = await this._schemaProvider.get()
    const workflowStep = schema?.workflowStep(effectiveTarget) ?? null

    // --- Enforce workflow requires ---
    if (workflowStep !== null && workflowStep.requires.length > 0) {
      for (const artifactId of workflowStep.requires) {
        const status = change.effectiveStatus(artifactId)
        const satisfied = status === 'complete' || status === 'skipped'
        onProgress?.({ type: 'requires-check', artifactId, satisfied })
        if (!satisfied) {
          throw new InvalidStateTransitionError(change.state, effectiveTarget)
        }
      }
    }

    // --- Task completion check (implementing → verifying) ---
    if (change.state === 'implementing' && effectiveTarget === 'verifying') {
      await this._checkTaskCompletion(change, input.implementingTaskChecks ?? [])
    }

    // --- Artifact validation clearing (verifying → implementing) ---
    if (change.state === 'verifying' && effectiveTarget === 'implementing') {
      change.clearArtifactValidations(input.implementingRequires ?? [])
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
   * Checks each artifact file for incomplete task items before allowing
   * the `implementing → verifying` transition.
   *
   * @param change - The change whose artifact files are checked
   * @param checks - Task completion check configurations
   * @throws {InvalidStateTransitionError} If any artifact contains incomplete task items
   */
  private async _checkTaskCompletion(
    change: Change,
    checks: ReadonlyArray<TaskCompletionCheck>,
  ): Promise<void> {
    for (const check of checks) {
      const artifact = await this._changes.artifact(change, check.filename)
      if (artifact === null) continue

      const re = safeRegex(check.incompletePattern, 'm')
      if (re !== null && re.test(artifact.content)) {
        throw new InvalidStateTransitionError('implementing', 'verifying')
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
