import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'

/** Input for the {@link ApproveSignoff} use case. */
export interface ApproveSignoffInput {
  /** The change to sign off. */
  readonly name: string
  /** Free-text rationale recorded in the signoff event. */
  readonly reason: string
  /** Hashes of the artifacts reviewed during this signoff. */
  readonly artifactHashes: Readonly<Record<string, string>>
  /** Whether the signoff gate is enabled in the active configuration. */
  readonly approvalsSignoff: boolean
}

/**
 * Records a signoff, then transitions the change to `signed-off`.
 *
 * Requires the signoff gate (`approvals.signoff: true`) to be active.
 * The caller is responsible for collecting current artifact hashes and passing
 * them in — these are recorded in the `signed-off` event for audit purposes.
 */
export class ApproveSignoff {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * Creates a new `ApproveSignoff` use case instance.
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
   * @param input - Signoff parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the signoff gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the change is not in `pending-signoff` state
   */
  async execute(input: ApproveSignoffInput): Promise<Change> {
    if (!input.approvalsSignoff) {
      throw new ApprovalGateDisabledError('signoff')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()
    change.recordSignoff(input.reason, input.artifactHashes, actor)
    change.transition('signed-off', actor)
    await this._changes.save(change)
    return change
  }
}
