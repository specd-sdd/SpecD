import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'

/**
 * Lists all active (non-drafted, non-discarded) changes in the default workspace.
 */
export class ListChanges {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `ListChanges` use case instance.
   *
   * @param changes - Repository for listing changes
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @returns All active changes, oldest first
   */
  async execute(): Promise<Change[]> {
    return this._changes.list()
  }
}
