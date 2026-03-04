import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link GetArchivedChange} use case. */
export interface GetArchivedChangeInput {
  /** The change name to look up in the archive. */
  name: string
}

/**
 * Retrieves a single archived change by name.
 *
 * Throws {@link ChangeNotFoundError} if the change does not exist in the archive.
 */
export class GetArchivedChange {
  private readonly _archive: ArchiveRepository

  /**
   * Creates a new `GetArchivedChange` use case instance.
   *
   * @param archive - Repository for retrieving archived changes
   */
  constructor(archive: ArchiveRepository) {
    this._archive = archive
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The archived change
   * @throws {ChangeNotFoundError} If no archived change with the given name exists
   */
  async execute(input: GetArchivedChangeInput): Promise<ArchivedChange> {
    const change = await this._archive.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }
    return change
  }
}
