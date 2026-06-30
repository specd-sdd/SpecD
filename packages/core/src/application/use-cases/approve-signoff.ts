import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { computeArtifactHash, buildCleanupMap } from './_shared/compute-artifact-hash.js'
import { type ApprovalGates } from './transition-change.js'

/** Input for the {@link ApproveSignoff} use case. */
export interface ApproveSignoffInput {
  /** The change to sign off. */
  readonly name: string
  /** Free-text rationale recorded in the signoff event. */
  readonly reason: string
}

/**
 * Records a signoff, then transitions the change to `signed-off`.
 *
 * Requires the signoff gate (`approvals.signoff: true`) to be active.
 * Artifact hashes are computed internally from the change's artifacts on disk,
 * using schema-defined pre-hash cleanup rules.
 */
export class ApproveSignoff {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _hasher: ContentHasher
  private readonly _approvals: ApprovalGates

  /**
   * Creates a new `ApproveSignoff` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param hasher - Content hasher for computing artifact hashes
   * @param approvals - Whether approval gates are active in the project configuration
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    hasher: ContentHasher,
    approvals: ApprovalGates,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._hasher = hasher
    this._approvals = approvals
  }

  /**
   * Executes the use case.
   *
   * @param input - Signoff parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the signoff gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the change is not in `pending-signoff` state
   * @throws {SchemaMismatchError} If the change schema differs from the active schema
   */
  async execute(input: ApproveSignoffInput): Promise<Change> {
    if (!this._approvals.signoff) {
      throw new ApprovalGateDisabledError('signoff')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._actor.identity()
    const schema = await this._schemaProvider.get()
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    return this._changes.mutate(input.name, async (freshChange) => {
      const artifactHashes = await this._computeArtifactHashes(freshChange)
      freshChange.recordSignoff(input.reason, artifactHashes, actor)
      freshChange.transition('signed-off', actor)
      return freshChange
    })
  }

  /**
   * Computes artifact hashes for all artifacts in the change, applying
   * schema-defined pre-hash cleanup rules.
   *
   * @param change - The change whose artifacts to hash
   * @returns Map of artifact filename to hash string
   */
  private async _computeArtifactHashes(change: Change): Promise<Record<string, string>> {
    const schema = await this._schemaProvider.get()
    const cleanupMap = buildCleanupMap(schema)

    const result: Record<string, string> = {}
    for (const [type, artifact] of change.artifacts) {
      const cleanups = cleanupMap.get(type) ?? []
      for (const [fileKey, file] of artifact.files) {
        if (file.status === 'missing' || file.status === 'skipped') continue
        const loaded = await this._changes.artifact(change, file.filename)
        if (loaded === null) continue
        const hashKey = `${type}:${fileKey}`
        result[hashKey] = computeArtifactHash(loaded.content, (c) => this._hasher.hash(c), cleanups)
      }
    }
    return result
  }
}
