import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'

/**
 * Lists all discarded changes in the default workspace.
 */
export class ListDiscarded {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `ListDiscarded` use case instance.
   *
   * @param changes - Repository for listing discarded changes
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @returns All discarded changes, oldest first
   */
  async execute(): Promise<Change[]> {
    return this._changes.listDiscarded()
  }
}
