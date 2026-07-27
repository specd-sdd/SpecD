import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'

/** Input for the {@link SaveChangeArtifact} use case. */
export interface SaveChangeArtifactInput {
  /** The change name. */
  readonly name: string
  /** Artifact content to persist. */
  readonly artifact: SpecArtifact
  /** Save options forwarded to the repository. */
  readonly options?: { readonly force?: boolean }
}

/** Result returned by the {@link SaveChangeArtifact} use case. */
export interface SaveChangeArtifactResult {
  /** ISO 8601 revision timestamp after persistence. */
  readonly updatedAt: string
}

/**
 * Persists artifact bytes for a change and returns the updated revision timestamp.
 */
export class SaveChangeArtifact {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `SaveChangeArtifact` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Save parameters
   * @returns The persisted revision timestamp
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: SaveChangeArtifactInput): Promise<SaveChangeArtifactResult> {
    const { change } = await this._changes.mutate(input.name, async (loaded) => {
      await this._changes.saveArtifact(loaded, input.artifact, input.options)
    })
    return { updatedAt: change.updatedAt.toISOString() }
  }
}
