import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link EditChange} use case. */
export interface EditChangeInput {
  /** The change to edit. */
  name: string
  /** Spec paths to add to `specIds`. */
  addSpecIds?: string[]
  /** Spec paths to remove from `specIds`. */
  removeSpecIds?: string[]
}

/** Result returned by the {@link EditChange} use case. */
export interface EditChangeResult {
  /** The updated change. */
  change: Change
  /** Whether approvals were invalidated by the edit. */
  invalidated: boolean
}

/**
 * Edits the spec scope of an existing change by adding or removing spec paths.
 *
 * Workspaces are always derived from the resulting set of `specIds` after the
 * edit — they are never managed directly. Any modification to `specIds` triggers
 * approval invalidation via {@link Change.updateSpecIds}, and the workspace
 * snapshot is brought in line via {@link Change.setWorkspacesSnapshot} without
 * emitting a redundant `workspace-change` invalidation.
 *
 * The change must retain at least one `specId` after editing.
 */
export class EditChange {
  private readonly _changes: ChangeRepository
  private readonly _git: GitAdapter
  private readonly _deriveWorkspaces: (specIds: readonly string[]) => string[]

  /**
   * Creates a new `EditChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param git - Adapter for resolving the actor identity
   * @param deriveWorkspaces - Function that derives workspace IDs from a list of spec paths
   */
  constructor(
    changes: ChangeRepository,
    git: GitAdapter,
    deriveWorkspaces: (specIds: readonly string[]) => string[],
  ) {
    this._changes = changes
    this._git = git
    this._deriveWorkspaces = deriveWorkspaces
  }

  /**
   * Executes the use case.
   *
   * @param input - Edit parameters
   * @returns The updated change and whether approvals were invalidated
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {Error} If the result would leave `specIds` empty or a spec to remove is not found
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
          throw new Error(`Spec '${id}' is not in the current specIds of change '${input.name}'`)
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

    if (specIds.length === 0) {
      throw new Error(`Editing change '${input.name}' would leave specIds empty`)
    }

    const actor = await this._git.identity()

    // Update spec IDs — this also appends an invalidated + transitioned event
    change.updateSpecIds(specIds, actor)

    // Derive and update workspace snapshot atomically (no additional invalidation event)
    const newWorkspaces = this._deriveWorkspaces(specIds)
    change.setWorkspacesSnapshot(newWorkspaces)

    await this._changes.save(change)
    return { change, invalidated: true }
  }
}
