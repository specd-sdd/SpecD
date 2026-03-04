import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'

/** Input for the {@link ApproveSpec} use case. */
export interface ApproveSpecInput {
  /** The change to approve the spec for. */
  readonly name: string
  /** Free-text rationale recorded in the approval event. */
  readonly reason: string
  /** Hashes of the artifacts reviewed during this approval. */
  readonly artifactHashes: Readonly<Record<string, string>>
  /** Whether the spec approval gate is enabled in the active configuration. */
  readonly approvalsSpec: boolean
}

/**
 * Records a spec approval, then transitions the change to `spec-approved`.
 *
 * Requires the spec approval gate (`approvals.spec: true`) to be active.
 * The caller is responsible for collecting current artifact hashes and passing
 * them in — these are recorded in the `spec-approved` event for audit purposes.
 */
export class ApproveSpec {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * Creates a new `ApproveSpec` use case instance.
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
   * @param input - Approval parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the spec approval gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the change is not in `pending-spec-approval` state
   */
  async execute(input: ApproveSpecInput): Promise<Change> {
    if (!input.approvalsSpec) {
      throw new ApprovalGateDisabledError('spec')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()
    change.recordSpecApproval(input.reason, input.artifactHashes, actor)
    change.transition('spec-approved', actor)
    await this._changes.save(change)
    return change
  }
}
