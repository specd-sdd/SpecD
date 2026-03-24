import { Change, type CreatedEvent } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ChangeAlreadyExistsError } from '../errors/change-already-exists-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'

/** Result returned by the {@link CreateChange} use case. */
export interface CreateChangeResult {
  /** The newly created change entity. */
  readonly change: Change
  /** Absolute filesystem path to the change directory. */
  readonly changePath: string
}

/** Input for the {@link CreateChange} use case. */
export interface CreateChangeInput {
  /** Unique slug name for the new change (e.g. `'add-oauth-login'`). */
  readonly name: string
  /** Optional free-text description of the change's purpose. */
  readonly description?: string
  /** Spec paths being created or modified by this change. */
  readonly specIds: readonly string[]
  /** The schema name from the active configuration (e.g. `'specd-std'`). */
  readonly schemaName: string
  /** The schema version number from the active configuration. */
  readonly schemaVersion: number
}

/**
 * Creates a new change and persists it to the repository.
 *
 * Rejects with {@link ChangeAlreadyExistsError} when a change with the same
 * name already exists. The initial history contains a single `created` event
 * recording the actor, workspaces, specIds, and schema reference.
 */
export class CreateChange {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _actor: ActorResolver

  /**
   * Creates a new `CreateChange` use case instance.
   *
   * @param changes - Repository for persisting the new change
   * @param specs - Spec repositories keyed by workspace name
   * @param actor - Resolver for the actor identity
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    actor: ActorResolver,
  ) {
    this._changes = changes
    this._specs = specs
    this._actor = actor
  }

  /**
   * Executes the use case.
   *
   * @param input - Creation parameters
   * @returns The newly created change and its filesystem path
   * @throws {ChangeAlreadyExistsError} If a change with the given name already exists
   */
  async execute(input: CreateChangeInput): Promise<CreateChangeResult> {
    const existing = await this._changes.get(input.name)
    if (existing !== null) {
      throw new ChangeAlreadyExistsError(input.name)
    }

    const actor = await this._actor.identity()
    const now = new Date()

    const created: CreatedEvent = {
      type: 'created',
      at: now,
      by: actor,
      specIds: input.specIds,
      schemaName: input.schemaName,
      schemaVersion: input.schemaVersion,
    }

    const change = new Change({
      name: input.name,
      createdAt: now,
      ...(input.description !== undefined ? { description: input.description } : {}),
      specIds: [...input.specIds],
      history: [created],
    })

    await this._changes.save(change)
    await this._changes.scaffold(change, (specId) => this._specExists(specId))
    const changePath = this._changes.changePath(change)
    return { change, changePath }
  }

  /**
   * Checks whether a spec exists in its workspace repository.
   *
   * @param specId - The spec identifier (e.g. `"default:auth/login"`)
   * @returns `true` if the spec exists
   */
  private async _specExists(specId: string): Promise<boolean> {
    const { workspace, capPath } = parseSpecId(specId)
    const repo = this._specs.get(workspace)
    if (repo === undefined) return false
    const spec = await repo.get(SpecPath.parse(capPath))
    return spec !== null
  }
}
