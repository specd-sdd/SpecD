import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ChangeArtifactFileNotFoundError } from '../errors/change-artifact-file-not-found-error.js'
import {
  type ReadOnlyChangeOrigin,
  type ReadOnlyChangeView,
} from '../../domain/read-only-change-view.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { findTrackedArtifactFileInView } from './_shared/find-tracked-artifact-file.js'

/** Input for {@link GetReadOnlyChangeArtifact}. */
export interface GetReadOnlyChangeArtifactInput {
  readonly readOnlyOrigin: ReadOnlyChangeOrigin
  readonly name: string
  readonly filename: string
}

/** Result returned by {@link GetReadOnlyChangeArtifact}. */
export interface GetReadOnlyChangeArtifactResult {
  readonly content: string
  readonly originalHash: string
}

/**
 * Loads a {@link ReadOnlyChangeView} for the given storage origin.
 *
 * @param changes - Change repository
 * @param readOnlyOrigin - Draft, discarded, or archived storage
 * @param name - Change name
 * @returns The read-only view, or `null` when not found
 */
async function loadReadOnlyChangeView(
  changes: ChangeRepository,
  readOnlyOrigin: ReadOnlyChangeOrigin,
  name: string,
): Promise<ReadOnlyChangeView | null> {
  switch (readOnlyOrigin) {
    case 'draft':
      return changes.getDraft(name)
    case 'discarded':
      return changes.getDiscarded(name)
    case 'archived':
      return null
  }
}

/** Loads tracked artifact bytes for any {@link ReadOnlyChangeView} storage (read-only). */
export class GetReadOnlyChangeArtifact {
  private readonly _changes: ChangeRepository

  /**
   * Creates the use case with a change repository.
   *
   * @param changes - Change repository
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Loads artifact bytes and the concurrency hash for a read-only change.
   *
   * @param input - Storage origin, change name, and tracked filename
   * @returns File content and `originalHash`
   */
  async execute(input: GetReadOnlyChangeArtifactInput): Promise<GetReadOnlyChangeArtifactResult> {
    if (input.readOnlyOrigin === 'archived') {
      throw new Error('readOnlyOrigin archived is not implemented yet')
    }

    const view = await loadReadOnlyChangeView(this._changes, input.readOnlyOrigin, input.name)
    if (view === null) {
      throw new ChangeNotFoundError(input.name)
    }

    if (findTrackedArtifactFileInView(view, input.filename) === undefined) {
      throw new ChangeArtifactFileNotFoundError(input.filename, input.name)
    }

    const artifact = await this._changes.artifactReadOnly(
      input.readOnlyOrigin,
      input.name,
      input.filename,
    )
    if (artifact === null) {
      throw new ChangeArtifactFileNotFoundError(input.filename, input.name)
    }

    return {
      content: artifact.content,
      originalHash: artifact.originalHash ?? '',
    }
  }
}
