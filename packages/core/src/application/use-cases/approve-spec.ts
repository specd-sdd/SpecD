import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'
import { computeArtifactHash, buildCleanupMap } from './_shared/compute-artifact-hash.js'

/** Input for the {@link ApproveSpec} use case. */
export interface ApproveSpecInput {
  /** The change to approve the spec for. */
  readonly name: string
  /** Free-text rationale recorded in the approval event. */
  readonly reason: string
  /** Whether the spec approval gate is enabled in the active configuration. */
  readonly approvalsSpec: boolean
}

/**
 * Records a spec approval, then transitions the change to `spec-approved`.
 *
 * Requires the spec approval gate (`approvals.spec: true`) to be active.
 * Artifact hashes are computed internally from the change's artifacts on disk,
 * using schema-defined pre-hash cleanup rules.
 */
export class ApproveSpec {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _hasher: ContentHasher

  /**
   * Creates a new `ApproveSpec` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param hasher - Content hasher for computing artifact hashes
   */
  constructor(
    changes: ChangeRepository,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    hasher: ContentHasher,
  ) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._hasher = hasher
  }

  /**
   * Executes the use case.
   *
   * @param input - Approval parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the spec approval gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the change is not in `pending-spec-approval` state
   */
  async execute(input: ApproveSpecInput): Promise<Change> {
    if (!input.approvalsSpec) {
      throw new ApprovalGateDisabledError('spec')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const artifactHashes = await this._computeArtifactHashes(change)

    const actor = await this._actor.identity()
    change.recordSpecApproval(input.reason, artifactHashes, actor)
    change.transition('spec-approved', actor)
    await this._changes.save(change)
    return change
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
