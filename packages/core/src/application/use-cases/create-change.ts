import { Change, type CreatedEvent } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeAlreadyExistsError } from '../errors/change-already-exists-error.js'

/** Input for the {@link CreateChange} use case. */
export interface CreateChangeInput {
  /** Unique slug name for the new change (e.g. `'add-oauth-login'`). */
  name: string
  /** Workspace IDs this change belongs to. */
  workspaces: string[]
  /** Spec paths being created or modified by this change. */
  specIds: string[]
  /** The schema name from the active configuration (e.g. `'specd-std'`). */
  schemaName: string
  /** The schema version number from the active configuration. */
  schemaVersion: number
}

/**
 * Creates a new change and persists it to the repository.
 *
 * Rejects with {@link ChangeAlreadyExistsError} when a change with the same
 * name already exists. The initial history contains a single `created` event
 * recording the actor, workspaces, specIds, and schema reference.
 */
export class CreateChange {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter

  /**
   * @param changes - Repository for persisting the new change
   * @param git - Adapter for resolving the actor identity
   */
  constructor(changes: ChangeRepository, git: GitAdapter) {
    this._changes = changes
    this._git = git
  }

  /**
   * Executes the use case.
   *
   * @param input - Creation parameters
   * @returns The newly created change
   * @throws {ChangeAlreadyExistsError} If a change with the given name already exists
   */
  async execute(input: CreateChangeInput): Promise<Change> {
    const existing = await this._changes.get(input.name)
    if (existing !== null) {
      throw new ChangeAlreadyExistsError(input.name)
    }

    const actor = await this._git.identity()
    const now = new Date()

    const created: CreatedEvent = {
      type: 'created',
      at: now,
      by: actor,
      workspaces: input.workspaces,
      specIds: input.specIds,
      schemaName: input.schemaName,
      schemaVersion: input.schemaVersion,
    }

    const change = new Change({
      name: input.name,
      createdAt: now,
      workspaces: input.workspaces,
      specIds: input.specIds,
      history: [created],
    })

    await this._changes.save(change)
    return change
  }
}
