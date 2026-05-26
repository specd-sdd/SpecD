import { type DraftedChangeView } from '../../domain/read-only-change-view.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link GetDraft} use case. */
export interface GetDraftInput {
  /** The drafted change name to load. */
  readonly name: string
}

/** Result returned by {@link GetDraft}. */
export interface GetDraftResult {
  /** Read-only drafted change view. */
  readonly view: DraftedChangeView
}

/**
 * Loads a drafted change by name for read-only inspection.
 */
export class GetDraft {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `GetDraft` use case instance.
   *
   * @param changes - Repository for drafted change resolution
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The drafted change view
   * @throws {ChangeNotFoundError} When the name is not found under `drafts/`
   */
  async execute(input: GetDraftInput): Promise<GetDraftResult> {
    const view = await this._changes.getDraft(input.name)
    if (view === null) {
      throw new ChangeNotFoundError(input.name)
    }
    return { view }
  }
}
