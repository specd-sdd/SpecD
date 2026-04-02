import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ArtifactNotFoundError } from '../errors/artifact-not-found-error.js'
import { ArtifactNotOptionalError } from '../../domain/errors/artifact-not-optional-error.js'

/** Input for the {@link SkipArtifact} use case. */
export interface SkipArtifactInput {
  /** The change name. */
  readonly name: string
  /** The artifact type ID to skip (e.g. `'proposal'`). */
  readonly artifactId: string
  /** Optional explanation for skipping. */
  readonly reason?: string
}

/**
 * Explicitly skips an optional artifact on a change.
 *
 * Throws {@link ArtifactNotOptionalError} if the artifact is not optional.
 * Throws {@link ChangeNotFoundError} if the change does not exist.
 */
export class SkipArtifact {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver

  /**
   * Creates a new `SkipArtifact` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   */
  constructor(changes: ChangeRepository, actor: ActorResolver) {
    this._changes = changes
    this._actor = actor
  }

  /**
   * Executes the use case.
   *
   * @param input - Skip parameters
   * @returns The updated change
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {ArtifactNotFoundError} If the artifact does not exist on the change
   * @throws {ArtifactNotOptionalError} If the artifact is not optional
   */
  async execute(input: SkipArtifactInput): Promise<Change> {
    const actor = await this._actor.identity()
    return this._changes.mutate(input.name, (change) => {
      const artifact = change.getArtifact(input.artifactId)
      if (artifact === null) {
        throw new ArtifactNotFoundError(input.artifactId, input.name)
      }

      if (!artifact.optional) {
        throw new ArtifactNotOptionalError(input.artifactId)
      }

      change.recordArtifactSkipped(input.artifactId, actor, input.reason)
      artifact.markSkipped()
      return change
    })
  }
}
