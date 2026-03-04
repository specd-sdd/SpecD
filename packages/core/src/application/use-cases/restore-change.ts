import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link RestoreChange} use case. */
export interface RestoreChangeInput {
  /** The drafted change to restore. */
  readonly name: string
}

/**
 * Recovers a drafted change back to `changes/`, appending a `restored` event.
 *
 * The `FsChangeRepository` implementation moves the change directory from
 * `drafts/` back to `changes/` when the manifest is saved with
 * `isDrafted === false`.
 */
export class RestoreChange {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * Creates a new `RestoreChange` use case instance.
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
   * @param input - Restore parameters
   * @returns The updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: RestoreChangeInput): Promise<Change> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()
    change.restore(actor)
    await this._changes.save(change)
    return change
  }
}
