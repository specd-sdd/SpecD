import { type DraftedChangeView } from '../../domain/read-only-change-view.js'
import { type ChangeRepository } from '../ports/change-repository.js'

/**
 * Lists all drafted changes in the default workspace.
 */
export class ListDrafts {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `ListDrafts` use case instance.
   *
   * @param changes - Repository for listing drafted changes
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @returns All drafted changes, oldest first
   */
  async execute(): Promise<DraftedChangeView[]> {
    return this._changes.listDrafts()
  }
}
