import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeArtifactFileNotFoundError } from '../errors/change-artifact-file-not-found-error.js'
import { findTrackedArtifactFile } from './_shared/find-tracked-artifact-file.js'

/** Input for {@link GetChangeArtifact}. */
export interface GetChangeArtifactInput {
  readonly name: string
  readonly filename: string
}

/** Result returned by {@link GetChangeArtifact}. */
export interface GetChangeArtifactResult {
  readonly content: string
  readonly originalHash: string
}

/** Loads tracked change artifact content and the optimistic-concurrency hash. */
export class GetChangeArtifact {
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
   * Loads artifact bytes and the concurrency hash for a tracked file.
   *
   * @param input - Change name and tracked filename
   * @returns File content and `originalHash` for the next save
   */
  async execute(input: GetChangeArtifactInput): Promise<GetChangeArtifactResult> {
    return this._changes.mutate(input.name, async (change) => {
      if (findTrackedArtifactFile(change, input.filename) === undefined) {
        throw new ChangeArtifactFileNotFoundError(input.filename, input.name)
      }

      const artifact = await this._changes.artifact(change, input.filename)
      if (artifact === null) {
        throw new ChangeArtifactFileNotFoundError(input.filename, input.name)
      }

      return {
        content: artifact.content,
        originalHash: artifact.originalHash ?? '',
      }
    })
  }
}
