import { type DiscardedChangeListEntry } from '../../domain/change-list-entry.js'
import {
  type ChangeRepository,
  type DiscardedChangeListOptions,
} from '../ports/change-repository.js'
import { type ListResult } from '../ports/repository.js'

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
   * @param options - Pagination and include projection options
   * @returns Paginated discarded change list entries, newest first
   */
  async execute(
    options?: DiscardedChangeListOptions,
  ): Promise<ListResult<DiscardedChangeListEntry>> {
    return this._changes.listDiscarded(options)
  }
}
