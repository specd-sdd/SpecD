import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'

/** Input for the {@link DiscardChange} use case. */
export interface DiscardChangeInput {
  /** The change to permanently discard. */
  readonly name: string
  /** Mandatory explanation for discarding. */
  readonly reason: string
  /** Optional list of change names that supersede this one. */
  readonly supersededBy?: string[]
  /** Explicit override for the historical implementation guard. */
  readonly force?: boolean
}

/**
 * Permanently abandons a change, appending a `discarded` event to its history.
 *
 * The `FsChangeRepository` implementation moves the change directory to
 * `discarded/` when the manifest is saved with a `discarded` terminal event.
 */
export class DiscardChange {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver

  /**
   * Creates a new `DiscardChange` use case instance.
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
   * @param input - Discard parameters
   * @returns The updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: DiscardChangeInput): Promise<Change> {
    const actor = await this._actor.identity()
    return this._changes.mutate(input.name, (change) => {
      change.discard(input.reason, actor, input.supersededBy, input.force)
      return change
    })
  }
}
