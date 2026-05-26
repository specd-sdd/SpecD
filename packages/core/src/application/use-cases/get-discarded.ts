import { type DiscardedChangeView } from '../../domain/read-only-change-view.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link GetDiscarded} use case. */
export interface GetDiscardedInput {
  /** The discarded change name to load. */
  readonly name: string
}

/** Result returned by {@link GetDiscarded}. */
export interface GetDiscardedResult {
  /** Read-only discarded change view. */
  readonly view: DiscardedChangeView
}

/**
 * Loads a discarded change by name for read-only inspection.
 */
export class GetDiscarded {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `GetDiscarded` use case instance.
   *
   * @param changes - Repository for discarded change resolution
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The discarded change view
   * @throws {ChangeNotFoundError} When the name is not found under `discarded/`
   */
  async execute(input: GetDiscardedInput): Promise<GetDiscardedResult> {
    const view = await this._changes.getDiscarded(input.name)
    if (view === null) {
      throw new ChangeNotFoundError(input.name)
    }
    return { view }
  }
}
