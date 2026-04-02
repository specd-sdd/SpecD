import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'

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
  private readonly _actor: ActorResolver

  /**
   * Creates a new `RestoreChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   */
  constructor(changes: ChangeRepository, actor: ActorResolver) {
    this._changes = changes
    this._actor = actor
  }

  /**
   * Executes the use case.
   *
   * @param input - Restore parameters
   * @returns The updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: RestoreChangeInput): Promise<Change> {
    const actor = await this._actor.identity()
    return this._changes.mutate(input.name, (change) => {
      change.restore(actor)
      return change
    })
  }
}
