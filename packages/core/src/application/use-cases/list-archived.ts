import {
  type ArchiveListOptions,
  type ArchiveListResult,
  type ArchiveRepository,
} from '../ports/archive-repository.js'

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
  async execute(options?: ArchiveListOptions): Promise<ArchiveListResult> {
    return this._archive.list(options)
  }
}
