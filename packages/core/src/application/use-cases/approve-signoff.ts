import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../errors/approval-gate-disabled-error.js'
import { type PreHashCleanup } from '../../domain/value-objects/validation-rule.js'
import { computeArtifactHash, buildCleanupMap } from './_shared/compute-artifact-hash.js'

/** Input for the {@link ApproveSignoff} use case. */
export interface ApproveSignoffInput {
  /** The change to sign off. */
  readonly name: string
  /** Free-text rationale recorded in the signoff event. */
  readonly reason: string
  /** Whether the signoff gate is enabled in the active configuration. */
  readonly approvalsSignoff: boolean
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
  private readonly _git: GitAdapter
  private readonly _schemas: SchemaRegistry
  private readonly _hasher: ContentHasher
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>

  /**
   * Creates a new `ApproveSignoff` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param git - Adapter for resolving the actor identity
   * @param schemas - Registry for resolving the active schema
   * @param hasher - Content hasher for computing artifact hashes
   * @param schemaRef - Schema reference string (e.g. `"@specd/schema-std"`)
   * @param workspaceSchemasPaths - Map of workspace name to absolute schemas directory path
   */
  constructor(
    changes: ChangeRepository,
    git: GitAdapter,
    schemas: SchemaRegistry,
    hasher: ContentHasher,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ) {
    this._changes = changes
    this._git = git
    this._schemas = schemas
    this._hasher = hasher
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
  }

  /**
   * Executes the use case.
   *
   * @param input - Signoff parameters
   * @returns The updated change
   * @throws {ApprovalGateDisabledError} If the signoff gate is not enabled
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the change is not in `pending-signoff` state
   */
  async execute(input: ApproveSignoffInput): Promise<Change> {
    if (!input.approvalsSignoff) {
      throw new ApprovalGateDisabledError('signoff')
    }

    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const artifactHashes = await this._computeArtifactHashes(change)

    const actor = await this._git.identity()
    change.recordSignoff(input.reason, artifactHashes, actor)
    change.transition('signed-off', actor)
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
    const schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
    const cleanupMap: ReadonlyMap<string, readonly PreHashCleanup[]> =
      schema !== null ? buildCleanupMap(schema) : new Map()

    const result: Record<string, string> = {}
    for (const [type, artifact] of change.artifacts) {
      const loaded = await this._changes.artifact(change, artifact.filename)
      if (loaded === null) continue
      const cleanups = cleanupMap.get(type) ?? []
      result[artifact.filename] = computeArtifactHash(
        loaded.content,
        (c) => this._hasher.hash(c),
        cleanups,
      )
    }
    return result
  }
}
