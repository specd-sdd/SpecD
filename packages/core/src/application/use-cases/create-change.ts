import { Change, type CreatedEvent } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ChangeAlreadyExistsError } from '../errors/change-already-exists-error.js'
import { type InvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { loadPersistedSpecDependsOn } from './_shared/load-persisted-spec-depends-on.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'

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
  /** Invalidation policy to seed on the new change. Defaults to `'downstream'`. */
  readonly invalidationPolicy?: InvalidationPolicy
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
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _actor: ActorResolver

  /**
   * Creates a new `CreateChange` use case instance.
   *
   * @param changes - Repository for persisting the new change
   * @param listWorkspaces - The project orchestrator
   * @param actor - Resolver for the actor identity
   */
  constructor(changes: ChangeRepository, listWorkspaces: ListWorkspaces, actor: ActorResolver) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
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
    const existingActive = await this._changes.get(input.name)
    if (existingActive !== null) {
      throw new ChangeAlreadyExistsError(input.name)
    }
    const existingDraft = await this._changes.getDraft(input.name)
    if (existingDraft !== null) {
      throw new ChangeAlreadyExistsError(input.name)
    }
    const existingDiscarded = await this._changes.getDiscarded(input.name)
    if (existingDiscarded !== null) {
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

    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    const specDependsOn = new Map<string, readonly string[]>()
    for (const specId of input.specIds) {
      const persisted = await loadPersistedSpecDependsOn(workspaceMap, specId)
      if (persisted.source !== 'empty') {
        specDependsOn.set(specId, persisted.dependsOn)
      }
    }

    const change = new Change({
      name: input.name,
      createdAt: now,
      ...(input.description !== undefined ? { description: input.description } : {}),
      specIds: [...input.specIds],
      history: [created],
      specDependsOn,
      ...(input.invalidationPolicy !== undefined
        ? { invalidationPolicy: input.invalidationPolicy }
        : {}),
    })

    await this._changes.save(change)
    await this._changes.scaffold(change, (specId) => this._specExists(workspaceMap, specId))
    const changePath = this._changes.changePath(change)
    return { change, changePath }
  }

  /**
   * Checks whether a spec exists in its workspace repository.
   *
   * @param workspaces - Orchestrated workspace map
   * @param specId - The spec identifier (e.g. `"default:auth/login"`)
   * @returns `true` if the spec exists
   */
  private async _specExists(
    workspaces: ReadonlyMap<string, ProjectWorkspace>,
    specId: string,
  ): Promise<boolean> {
    const { workspace, capPath } = parseSpecId(specId)
    const ws = workspaces.get(workspace)
    if (ws === undefined) return false
    const spec = await ws.specRepo.get(SpecPath.parse(capPath))
    return spec !== null
  }
}
