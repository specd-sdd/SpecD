import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link DiscardChange} use case. */
export interface DiscardChangeInput {
  /** The change to permanently discard. */
  name: string
  /** Mandatory explanation for discarding. */
  reason: string
  /** Optional list of change names that supersede this one. */
  supersededBy?: string[]
}

/**
 * Permanently abandons a change, appending a `discarded` event to its history.
 *
 * The `FsChangeRepository` implementation moves the change directory to
 * `discarded/` when the manifest is saved with a `discarded` terminal event.
 */
export class DiscardChange {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * Creates a new `DiscardChange` use case instance.
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
   * @param input - Discard parameters
   * @returns The updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: DiscardChangeInput): Promise<Change> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()
    change.discard(input.reason, actor, input.supersededBy)
    await this._changes.save(change)
    return change
  }
}
