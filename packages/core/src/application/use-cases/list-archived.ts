import { type ArchiveListEntry } from '../../domain/archived-change-index-entry.js'
import { type ArchiveListOptions, type ArchiveRepository } from '../ports/archive-repository.js'
import { type ListResult } from '../ports/repository.js'

/**
 * Lists archived changes in the default workspace.
 */
export class ListArchived {
  private readonly _archive: ArchiveRepository

  /**
   * Creates a new `ListArchived` use case instance.
   *
   * @param archive - Repository for listing archived changes
   */
  constructor(archive: ArchiveRepository) {
    this._archive = archive
  }

  /**
   * Executes the use case.
   *
   * @param options - Pagination and filtering options
   * @returns Paginated archived changes result
   */
  async execute(options?: ArchiveListOptions): Promise<ListResult<ArchiveListEntry>> {
    return this._archive.list(options)
  }
}
