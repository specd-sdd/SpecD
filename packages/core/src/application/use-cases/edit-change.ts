import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'

/** Input for the {@link EditChange} use case. */
export interface EditChangeInput {
  /** The change to edit. */
  readonly name: string
  /** Spec paths to add to `specIds`. */
  readonly addSpecIds?: string[]
  /** Spec paths to remove from `specIds`. */
  readonly removeSpecIds?: string[]
}

/** Result returned by the {@link EditChange} use case. */
export interface EditChangeResult {
  /** The updated change. */
  readonly change: Change
  /** Whether approvals were invalidated by the edit. */
  readonly invalidated: boolean
}

/**
 * Edits the spec scope of an existing change by adding or removing spec paths.
 *
 * Workspaces are derived from the resulting set of `specIds` via the computed
 * `Change.workspaces` getter — they are never managed directly. Any
 * modification to `specIds` triggers approval invalidation via
 * {@link Change.updateSpecIds}.
 */
export class EditChange {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _actor: ActorResolver

  /**
   * Creates a new `EditChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
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
   * @param input - Edit parameters
   * @returns The updated change and whether approvals were invalidated
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SpecNotInChangeError} If a spec to remove is not in the change's specIds
   */
  async execute(input: EditChangeInput): Promise<EditChangeResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const hasSpecChanges =
      (input.addSpecIds !== undefined && input.addSpecIds.length > 0) ||
      (input.removeSpecIds !== undefined && input.removeSpecIds.length > 0)

    if (!hasSpecChanges) {
      return { change, invalidated: false }
    }

    const actor = await this._actor.identity()
    const persisted = await this._changes.mutate(input.name, (freshChange) => {
      const specIds = [...freshChange.specIds]

      if (input.removeSpecIds !== undefined) {
        for (const id of input.removeSpecIds) {
          const idx = specIds.indexOf(id)
          if (idx === -1) {
            throw new SpecNotInChangeError(id, input.name)
          }
          specIds.splice(idx, 1)
        }
      }

      if (input.addSpecIds !== undefined) {
        for (const id of input.addSpecIds) {
          if (!specIds.includes(id)) {
            specIds.push(id)
          }
        }
      }

      const currentSpecIds = freshChange.specIds
      const specIdsChanged =
        specIds.length !== currentSpecIds.length ||
        specIds.some((id, i) => id !== currentSpecIds[i])

      if (!specIdsChanged) {
        return {
          change: freshChange,
          invalidated: false,
          removedSpecIds: [] as string[],
        }
      }

      const removedSpecIds = currentSpecIds.filter((id) => !specIds.includes(id))
      freshChange.updateSpecIds(specIds, actor)
      return { change: freshChange, invalidated: true, removedSpecIds }
    })

    if (persisted.removedSpecIds.length > 0) {
      await this._changes.unscaffold(persisted.change, persisted.removedSpecIds)
    }

    if (persisted.invalidated) {
      await this._changes.scaffold(persisted.change, (specId) => this._specExists(specId))
    }

    return { change: persisted.change, invalidated: persisted.invalidated }
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
