import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link DraftChange} use case. */
export interface DraftChangeInput {
  /** The change to shelve. */
  name: string
  /** Optional explanation for shelving the change. */
  reason?: string
}

/**
 * Shelves a change to `drafts/`, appending a `drafted` event to its history.
 *
 * The `FsChangeRepository` implementation moves the change directory from
 * `changes/` to `drafts/` when the manifest is saved with `isDrafted === true`.
 */
export class DraftChange {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * Creates a new `DraftChange` use case instance.
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
   * @param input - Shelving parameters
   * @returns The updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: DraftChangeInput): Promise<Change> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()
    change.draft(actor, input.reason)
    await this._changes.save(change)
    return change
  }
}
