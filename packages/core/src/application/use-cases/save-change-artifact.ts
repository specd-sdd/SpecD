import { type ActorIdentity } from '../../domain/entities/change.js'
import { ArtifactFile } from '../../domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { SaveRequiresForceError } from '../errors/save-requires-force-error.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ChangeArtifactFileNotFoundError } from '../errors/change-artifact-file-not-found-error.js'
import { findTrackedArtifactFile } from './_shared/find-tracked-artifact-file.js'

/** Input for {@link SaveChangeArtifact}. */
export interface SaveChangeArtifactInput {
  readonly name: string
  readonly filename: string
  readonly content: string
  readonly originalHash: string
  readonly actor: ActorIdentity
  readonly force?: boolean
}

/** Result returned by {@link SaveChangeArtifact}. */
export interface SaveChangeArtifactResult {
  readonly contentHash: string
  readonly updatedAt: string
  readonly invalidated: boolean
}

/**
 * Saves a tracked change artifact with optimistic concurrency and manifest revision bumps.
 */
export class SaveChangeArtifact {
  private readonly _changes: ChangeRepository
  private readonly _schemaProvider: SchemaProvider
  private readonly _hasher: ContentHasher

  /**
   * Creates the use case with repository, schema, and hashing dependencies.
   *
   * @param changes - Change repository
   * @param schemaProvider - Schema provider for invalidation DAG
   * @param hasher - Content hasher for the saved payload
   */
  constructor(changes: ChangeRepository, schemaProvider: SchemaProvider, hasher: ContentHasher) {
    this._changes = changes
    this._schemaProvider = schemaProvider
    this._hasher = hasher
  }

  /**
   * Persists artifact content with optimistic concurrency and optional force.
   *
   * @param input - Save parameters
   * @returns Content hash, new revision clock, and whether invalidation ran
   */
  async execute(input: SaveChangeArtifactInput): Promise<SaveChangeArtifactResult> {
    const force = input.force === true
    let invalidated = false

    const contentHash = await this._changes.mutate(input.name, async (change) => {
      const located = findTrackedArtifactFile(change, input.filename)
      if (located === undefined) {
        throw new ChangeArtifactFileNotFoundError(input.filename, input.name)
      }

      if (
        (change.activeSpecApproval !== undefined || change.activeSignoff !== undefined) &&
        !force
      ) {
        throw new SaveRequiresForceError()
      }

      await this._changes.saveArtifact(
        change,
        new SpecArtifact(input.filename, input.content, input.originalHash),
        { force },
      )

      located.artifact.setFile(
        new ArtifactFile({
          key: located.file.key,
          filename: located.file.filename,
          status: 'in-progress',
        }),
      )

      invalidated = await this._changes.reconcileArtifactDrift(change, {
        excludeFileKeys: [located.file.key],
      })

      if (
        force &&
        (change.activeSpecApproval !== undefined || change.activeSignoff !== undefined)
      ) {
        const schema = await this._schemaProvider.get()
        change.invalidate(
          'artifact-review-required',
          input.actor,
          'Artifact saved with force while approval or signoff was active',
          [{ type: located.artifact.type, files: [located.file.key] }],
          schema.artifactDag(),
        )
        invalidated = true
      }

      return this._hasher.hash(input.content)
    })

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    return {
      contentHash,
      updatedAt: change.updatedAt.toISOString(),
      invalidated,
    }
  }
}
