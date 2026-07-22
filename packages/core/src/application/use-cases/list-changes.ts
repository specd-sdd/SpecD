import { type ActiveChangeListEntry } from '../../domain/change-list-entry.js'
import { type ActiveChangeListOptions, type ChangeRepository } from '../ports/change-repository.js'
import { type ListResult } from '../ports/repository.js'

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
   * @param options - Pagination and include projection options
   * @returns Paginated active change list entries, oldest first
   */
  async execute(options?: ActiveChangeListOptions): Promise<ListResult<ActiveChangeListEntry>> {
    return this._changes.list(options)
  }
}
