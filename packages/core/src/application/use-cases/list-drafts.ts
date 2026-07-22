import { type DraftedChangeListEntry } from '../../domain/change-list-entry.js'
import { type ChangeRepository, type DraftedChangeListOptions } from '../ports/change-repository.js'
import { type ListResult } from '../ports/repository.js'

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
   * @param options - Pagination and include projection options
   * @returns Paginated drafted change list entries, newest first
   */
  async execute(options?: DraftedChangeListOptions): Promise<ListResult<DraftedChangeListEntry>> {
    return this._changes.listDrafts(options)
  }
}
