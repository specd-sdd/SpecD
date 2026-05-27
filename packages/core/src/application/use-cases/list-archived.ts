import { type ArchivedChangeIndexEntry } from '../../domain/archived-change-index-entry.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'

/**
 * Lists all archived changes in the default workspace.
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
   * @returns All archived changes, oldest first
   */
  async execute(): Promise<ArchivedChangeIndexEntry[]> {
    return this._archive.list()
  }
}
