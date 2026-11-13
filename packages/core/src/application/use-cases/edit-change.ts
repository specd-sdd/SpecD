import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import { IncompatibleSchemaError } from '../../domain/errors/incompatible-schema-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type InvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { loadPersistedSpecDependsOn } from './_shared/load-persisted-spec-depends-on.js'
import { loadPersistedSpecSchema } from './_shared/load-persisted-spec-schema.js'
import { assertInvalidationPolicy } from './_shared/assert-invalidation-policy.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'

/** Result returned by the {@link EditChange} use case. */
export interface EditChangeResult {
  /** The updated change entity. */
  readonly change: Change
  /** Whether the modification invalidated existing approvals. */
  readonly invalidated: boolean
}

/** Input for the {@link EditChange} use case. */
export interface EditChangeInput {
  /** Name of the change to edit. */
  readonly name: string
  /** Optional updated description. */
  readonly description?: string
  /** Spec paths to add to the change. */
  readonly addSpecIds?: readonly string[]
  /** Spec paths to remove from the change. */
  readonly removeSpecIds?: readonly string[]
  /**
   * Invalidation policy override to update on the change. Counts as a change on its own: it is
   * persisted even when no description or spec change is requested.
   */
  readonly invalidationPolicy?: string
}

/**
 * Edits metadata and scope of an active change.
 *
 * Any modification to `description` only records a `description-updated` event.
 * Any modification to `specIds` triggers approval invalidation via
 * {@link Change.updateSpecIds}.
 */
export class EditChange {
  private readonly _changes: ChangeRepository
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _refresh?: RefreshImplementationTracking | undefined

  /**
   * Creates a new `EditChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param listWorkspaces - The project orchestrator
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the active schema DAG
   * @param refreshImplementationTracking - Optional refresh handler for implementation tracking cleanup
   */
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    refreshImplementationTracking?: RefreshImplementationTracking,
  ) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._refresh = refreshImplementationTracking
  }

  /**
   * Executes the use case.
   *
   * @param input - Edit parameters
   * @returns The updated change and whether approvals were invalidated
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidInputError} If `invalidationPolicy` is not one of the allowed values
   * @throws {InvalidSpecIdError} If an added spec ID is empty, blank, or malformed
   * @throws {WorkspaceNotFoundError} If an added spec ID names an unknown workspace
   * @throws {ReadOnlyWorkspaceError} If an added spec belongs to a readOnly workspace
   * @throws {IncompatibleSchemaError} If an added spec uses an incompatible persisted schema
   * @throws {SpecNotInChangeError} If a spec to remove is not in the change's specIds
   */
  async execute(input: EditChangeInput): Promise<EditChangeResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const invalidationPolicy = assertInvalidationPolicy(input.invalidationPolicy)

    const hasDescriptionChange = input.description !== undefined
    const hasPolicyChange = invalidationPolicy !== undefined
    const hasSpecChanges =
      (input.addSpecIds !== undefined && input.addSpecIds.length > 0) ||
      (input.removeSpecIds !== undefined && input.removeSpecIds.length > 0)

    if (!hasDescriptionChange && !hasSpecChanges && !hasPolicyChange) {
      return { change, invalidated: false }
    }

    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    const parsedAdds =
      input.addSpecIds !== undefined && input.addSpecIds.length > 0
        ? input.addSpecIds.map((id) => parseSpecId(id, { workspaces }))
        : undefined

    if (parsedAdds !== undefined) {
      const readOnlyOffenders = parsedAdds.filter(
        (parsed) => workspaceMap.get(parsed.workspace)?.ownership === 'readOnly',
      )
      if (readOnlyOffenders.length > 0) {
        const lines = readOnlyOffenders.map(
          (parsed) =>
            `Cannot add spec "${parsed.specId}" to change — workspace "${parsed.workspace}" is readOnly.`,
        )
        throw new ReadOnlyWorkspaceError(
          `${lines.join('\n')}\n\nReadOnly workspaces are protected: their specs and code cannot be modified by changes.`,
        )
      }
    }

    const addSpecIds = parsedAdds?.map((parsed) => parsed.specId)
    const removeNormalized =
      input.removeSpecIds !== undefined
        ? input.removeSpecIds.map((id) => {
            try {
              return parseSpecId(id, { workspaces }).specId
            } catch {
              return id
            }
          })
        : undefined
    const removeSpecIds =
      removeNormalized === undefined ? undefined : [...new Set(removeNormalized)]

    if (this._isNoOp(change, input, invalidationPolicy, addSpecIds, removeSpecIds)) {
      return { change, invalidated: false }
    }

    if (addSpecIds !== undefined && addSpecIds.length > 0) {
      const schema = await this._schemaProvider.get()
      for (const specId of addSpecIds) {
        const persisted = await loadPersistedSpecSchema(workspaceMap, specId)
        const specSchemaName = persisted.schema !== null ? persisted.schema.name : schema.name()
        const isCompatible =
          specSchemaName === change.schemaName || schema.compat()?.name === specSchemaName

        if (!isCompatible) {
          throw new IncompatibleSchemaError(specId, specSchemaName, change.schemaName)
        }
      }
    }

    let actor: Awaited<ReturnType<ActorResolver['identity']>> | undefined
    const resolveActor = async (): Promise<Awaited<ReturnType<ActorResolver['identity']>>> =>
      (actor ??= await this._actor.identity())

    const { result: persisted, change: initialChange } = await this._changes.mutate(
      input.name,
      async (freshChange) => {
        let specIdsChanged = false
        let removedSpecIds: string[] = []
        let addedSpecIds: string[] = []

        if (hasSpecChanges) {
          const specIds = [...freshChange.specIds]

          if (removeSpecIds !== undefined) {
            for (const id of removeSpecIds) {
              const idx = specIds.indexOf(id)
              if (idx === -1) {
                throw new SpecNotInChangeError(id, input.name)
              }
              specIds.splice(idx, 1)
            }
          }

          if (addSpecIds !== undefined) {
            for (const id of addSpecIds) {
              if (!specIds.includes(id)) {
                specIds.push(id)
              }
            }
          }

          const currentSpecIds = freshChange.specIds
          addedSpecIds = specIds.filter((id) => !currentSpecIds.includes(id))
          specIdsChanged =
            specIds.length !== currentSpecIds.length ||
            specIds.some((id, i) => id !== currentSpecIds[i])

          if (specIdsChanged) {
            removedSpecIds = currentSpecIds.filter((id) => !specIds.includes(id))
            const schema = await this._schemaProvider.get()
            freshChange.updateSpecIds(specIds, await resolveActor(), schema.artifactDag())
            for (const specId of addedSpecIds) {
              if (freshChange.specDependsOn.get(specId) !== undefined) continue
              const persistedDeps = await loadPersistedSpecDependsOn(workspaceMap, specId)
              freshChange.setSpecDependsOn(specId, persistedDeps.dependsOn)
            }
          }
        }

        if (hasDescriptionChange) {
          freshChange.updateDescription(input.description ?? '', await resolveActor())
        }

        if (invalidationPolicy !== undefined) {
          freshChange.invalidationPolicy = invalidationPolicy
        }

        return { invalidated: specIdsChanged, removedSpecIds }
      },
    )

    let updatedChange = initialChange
    if (persisted.invalidated && persisted.removedSpecIds.length > 0) {
      await this._changes.unscaffold(updatedChange, persisted.removedSpecIds)
    }

    if (persisted.invalidated) {
      await this._changes.scaffold(updatedChange, (specId) =>
        this._specExists(workspaceMap, specId),
      )
      if (this._refresh !== undefined) {
        await this._refresh.execute({ name: input.name })
        const reloaded = await this._changes.get(input.name)
        if (reloaded !== null) {
          updatedChange = reloaded
        }
      }
    }

    return { change: updatedChange, invalidated: persisted.invalidated }
  }

  /**
   * Tells whether applying the request to the persisted change would alter nothing.
   *
   * A request whose resulting `specIds`, description and invalidation policy equal the persisted
   * ones persists nothing and resolves no actor. A removal of a spec that is not in the change is
   * never a no-op: the mutation must run so it fails with `SpecNotInChangeError`.
   *
   * @param change - The persisted change snapshot
   * @param input - The edit request
   * @param invalidationPolicy - The validated policy from the request, if any
   * @param addSpecIds - Normalized spec IDs to add
   * @param removeSpecIds - Normalized, de-duplicated spec IDs to remove
   * @returns `true` when nothing would change
   */
  private _isNoOp(
    change: Change,
    input: EditChangeInput,
    invalidationPolicy: InvalidationPolicy | undefined,
    addSpecIds: readonly string[] | undefined,
    removeSpecIds: readonly string[] | undefined,
  ): boolean {
    if (input.description !== undefined && input.description !== (change.description ?? '')) {
      return false
    }
    if (invalidationPolicy !== undefined && invalidationPolicy !== change.invalidationPolicy) {
      return false
    }
    const specIds = [...change.specIds]
    for (const id of removeSpecIds ?? []) {
      const idx = specIds.indexOf(id)
      if (idx === -1) return false
      specIds.splice(idx, 1)
    }
    for (const id of addSpecIds ?? []) {
      if (!specIds.includes(id)) specIds.push(id)
    }
    return (
      specIds.length === change.specIds.length && specIds.every((id, i) => id === change.specIds[i])
    )
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
    const { workspace, capPath } = parseSpecId(specId, { workspaces: workspaces.keys() })
    const ws = workspaces.get(workspace)
    if (ws === undefined) return false
    const spec = await ws.specRepo.get(SpecPath.parse(capPath))
    return spec !== null
  }
}
