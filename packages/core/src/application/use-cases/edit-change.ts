import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'

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
  private readonly _git: GitAdapter

  /**
   * Creates a new `EditChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param git - Adapter for resolving the actor identity
   */
  constructor(changes: ChangeRepository, git: GitAdapter) {
    this._changes = changes
    this._git = git
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

    // Compute new spec IDs
    const specIds = [...change.specIds]

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

    // Check if specIds actually changed
    const currentSpecIds = change.specIds
    const specIdsChanged =
      specIds.length !== currentSpecIds.length || specIds.some((id, i) => id !== currentSpecIds[i])

    if (!specIdsChanged) {
      return { change, invalidated: false }
    }

    const actor = await this._git.identity()

    // Update spec IDs — this also appends an invalidated + transitioned event
    change.updateSpecIds(specIds, actor)

    await this._changes.save(change)
    return { change, invalidated: true }
  }
}
