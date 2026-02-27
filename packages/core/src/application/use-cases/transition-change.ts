import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link TransitionChange} use case. */
export interface TransitionChangeInput {
  /** The change to transition. */
  name: string
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
  to: ChangeState
  /**
   * Whether the spec approval gate is enabled in the active configuration.
   *
   * When `true` and the change is in `ready` state transitioning toward
   * `implementing`, the actual target is routed to `pending-spec-approval`.
   */
  approvalsSpec: boolean
  /**
   * Whether the signoff gate is enabled in the active configuration.
   *
   * When `true` and the change is in `done` state transitioning toward
   * `archivable`, the actual target is routed to `pending-signoff`.
   */
  approvalsSignoff: boolean
  /**
   * Context spec paths to set when transitioning `designing → ready`.
   *
   * Resolved by the caller from `.specd-metadata.yaml` `dependsOn` entries.
   * Ignored on all other transitions.
   */
  contextSpecIds?: string[]
  /**
   * Artifact IDs whose validation is cleared when transitioning
   * `verifying → implementing`.
   *
   * Should be the `requires` list of the schema's `implementing` workflow step.
   * Ignored on all other transitions.
   */
  implementingRequires?: readonly string[]
}

/**
 * Performs a lifecycle state transition on a change with approval-gate routing.
 *
 * Handles the two smart-routing decision points:
 * - `ready → implementing` is redirected to `ready → pending-spec-approval`
 *   when the spec approval gate is active.
 * - `done → archivable` is redirected to `done → pending-signoff` when the
 *   signoff gate is active.
 *
 * When transitioning from `designing` to `ready`, any provided `contextSpecIds`
 * are applied to the change before the transition is recorded.
 */
export class TransitionChange {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * Creates a new `TransitionChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param git - Adapter for resolving the actor identity
   */
  constructor(changes: ChangeRepository, git: GitAdapter) {
    this._changes = changes
    this._git = git
  }

  /**
   * Executes the use case.
   *
   * @param input - Transition parameters
   * @returns The updated change after the transition
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the transition is not permitted
   */
  async execute(input: TransitionChangeInput): Promise<Change> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()

    const effectiveTarget = this._resolveTarget(change.state, input)

    if (change.state === 'designing' && effectiveTarget === 'ready' && input.contextSpecIds) {
      change.updateContextSpecIds(input.contextSpecIds)
    }

    if (change.state === 'verifying' && effectiveTarget === 'implementing') {
      change.clearArtifactValidations(input.implementingRequires ?? [])
    }

    change.transition(effectiveTarget, actor)
    await this._changes.save(change)
    return change
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
