import { type ActorIdentity, type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import {
  resolveInvalidationPolicy,
  type InvalidationPolicy,
  type InvalidationPolicyOverride,
} from '../../domain/value-objects/invalidation-policy.js'
import {
  type ArtifactReviewTarget,
  type AutomaticRecovery,
  type ProjectionChange,
  type ValidityBlocker,
} from '../../domain/services/change-validity.js'
import { type NextAction } from './get-status.js'
import { IncompatibleSchemaError } from '../../domain/errors/incompatible-schema-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { loadPersistedSpecDependsOn } from './_shared/load-persisted-spec-depends-on.js'
import { loadPersistedSpecSchema } from './_shared/load-persisted-spec-schema.js'
import { assertInvalidationPolicyOverride } from './_shared/assert-invalidation-policy.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'

/** Result returned by the {@link EditChange} use case. */
export interface EditChangeResult {
  /** The updated change entity. */
  readonly change: Change
  /** Whether spec scope changed. Retained for existing callers. */
  readonly invalidated: boolean
  /** Whether spec ids were added or removed. */
  readonly scopeChanged: boolean
  /** Whether reconciliation changed a projection. Policy-only edits stay false. */
  readonly validityChanged: boolean
  /** Policy persisted after the partial overlay. */
  readonly effectivePolicy: InvalidationPolicy
  /** Projection status transitions applied by reconciliation. */
  readonly projectionChanges: readonly ProjectionChange[]
  /** Artifact files affected by the edit's validity consequences. */
  readonly affectedArtifacts: readonly ArtifactReviewTarget[]
  /** Committed lifecycle return, when recovery was required. */
  readonly automaticReturn: AutomaticRecovery | null
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
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
  /** Partial invalidation policy overlay. Unspecified dimensions stay unchanged. */
  readonly invalidation?: InvalidationPolicyOverride
}

import { ResolveChangeSchema } from '../services/resolve-change-schema.js'

/**
 * Edits metadata and scope of an active change.
 *
 * Any modification to `description` only records a `description-updated` event.
 * Scope modifications are serialized through the dedicated reconciliation path.
 */
export class EditChange {
  private readonly _changes: ChangeRepository
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider
  private readonly _refresh?: RefreshImplementationTracking | undefined
  private readonly _reconcile: ReconcileChangeValidity
  private readonly _resolveChangeSchema: ResolveChangeSchema

  /**
   * Creates a new `EditChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param listWorkspaces - The project orchestrator
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the active schema DAG
   * @param refreshImplementationTracking - Optional (`undefined` when unavailable) refresh handler for implementation tracking cleanup
   * @param reconcile - Canonical reconciler for scope edits
   * @param resolveChangeSchema - Shared change schema resolver
   */
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    refreshImplementationTracking: RefreshImplementationTracking | undefined,
    reconcile: ReconcileChangeValidity,
    resolveChangeSchema?: ResolveChangeSchema,
  ) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._refresh = refreshImplementationTracking
    this._reconcile = reconcile
    this._resolveChangeSchema = resolveChangeSchema ?? new ResolveChangeSchema(schemaProvider)
  }

  /**
   * Executes the use case.
   *
   * @param input - Edit parameters
   * @returns The updated change and whether approvals were invalidated
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidInputError} If `invalidation` contains an invalid artifact or workflow policy
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

    const invalidationOverride = assertInvalidationPolicyOverride(input.invalidation)

    const hasDescriptionChange =
      input.description !== undefined && input.description !== change.description
    const resolvedPolicy = resolveInvalidationPolicy(
      change.invalidationPolicy,
      invalidationOverride,
    )
    const policyChanged = !samePolicy(change.invalidationPolicy, resolvedPolicy)
    const hasSpecChanges =
      (input.addSpecIds !== undefined && input.addSpecIds.length > 0) ||
      (input.removeSpecIds !== undefined && input.removeSpecIds.length > 0)

    if (!hasDescriptionChange && !hasSpecChanges && !policyChanged) {
      return editResult(change, false, resolvedPolicy)
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

    if (hasSpecChanges) {
      const { schema } = await this._resolveChangeSchema.execute({
        changeName: change.name,
        schemaName: change.schemaName,
        schemaVersion: change.schemaVersion,
      })

      if (addSpecIds !== undefined && addSpecIds.length > 0) {
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

      const hasEffectiveAdds = (addSpecIds ?? []).some((id) => !change.specIds.includes(id))
      const hasRemoveInputs = removeSpecIds !== undefined && removeSpecIds.length > 0

      if (hasEffectiveAdds || hasRemoveInputs) {
        const actor = await this._actor.identity()
        return this._executeScopeEdit(
          {
            ...input,
            ...(addSpecIds !== undefined ? { addSpecIds } : {}),
            ...(removeSpecIds !== undefined ? { removeSpecIds } : {}),
          },
          actor,
          workspaceMap,
          resolvedPolicy,
          policyChanged,
          hasDescriptionChange,
        )
      }
    }

    if (!hasDescriptionChange && !policyChanged) {
      return editResult(change, false, resolvedPolicy)
    }

    let actor: Awaited<ReturnType<ActorResolver['identity']>> | undefined
    const resolveActor = async (): Promise<Awaited<ReturnType<ActorResolver['identity']>>> =>
      (actor ??= await this._actor.identity())

    const { change: updatedChange } = await this._changes.mutate(
      input.name,
      async (freshChange) => {
        if (hasDescriptionChange) {
          freshChange.updateDescription(input.description ?? '', await resolveActor())
        }

        if (policyChanged) {
          freshChange.invalidationPolicy = resolvedPolicy
        }

        return undefined
      },
    )

    return editResult(updatedChange, false, resolvedPolicy)
  }

  /**
   *  execute scope edit.
   *
   * @param input - input
   * @param actor - actor
   * @param workspaceMap - workspace map
   * @param resolvedPolicy - resolved policy
   * @param policyChanged - policy changed
   * @param hasDescriptionChange - has description change
   * @returns  execute scope edit result
   */
  private async _executeScopeEdit(
    input: EditChangeInput,
    actor: ActorIdentity,
    workspaceMap: ReadonlyMap<string, ProjectWorkspace>,
    resolvedPolicy: InvalidationPolicy,
    policyChanged: boolean,
    hasDescriptionChange: boolean,
  ): Promise<EditChangeResult> {
    const mutation = await this._reconcile.mutate({ name: input.name, actor }, async (ctx) => {
      const freshChange = ctx.change
      if (policyChanged) freshChange.invalidationPolicy = resolvedPolicy
      if (hasDescriptionChange) freshChange.updateDescription(input.description ?? '', actor)
      const specIds = [...freshChange.specIds]
      if (input.removeSpecIds !== undefined) {
        for (const id of input.removeSpecIds) {
          const idx = specIds.indexOf(id)
          if (idx === -1) throw new SpecNotInChangeError(id, input.name)
          specIds.splice(idx, 1)
        }
      }
      if (input.addSpecIds !== undefined) {
        for (const id of input.addSpecIds) {
          if (!specIds.includes(id)) specIds.push(id)
        }
      }
      const currentSpecIds = freshChange.specIds
      const addedSpecIds = specIds.filter((id) => !currentSpecIds.includes(id))
      const specIdsChanged =
        specIds.length !== currentSpecIds.length ||
        specIds.some((id, index) => id !== currentSpecIds[index])
      if (!specIdsChanged) return { scopeChanged: false, removedSpecIds: [] as string[] }
      const removedSpecIds = currentSpecIds.filter((id) => !specIds.includes(id))
      freshChange.replaceSpecIds(specIds)
      for (const specId of addedSpecIds) {
        if (freshChange.specDependsOn.get(specId) !== undefined) continue
        const persistedDeps = await loadPersistedSpecDependsOn(workspaceMap, specId)
        freshChange.setSpecDependsOn(specId, persistedDeps.dependsOn)
      }
      await ctx.reconcileAfter({ type: 'scope-change', reason: 'Change scope changed' })
      return { scopeChanged: true, removedSpecIds }
    })

    let updatedChange = mutation.change
    if (mutation.result.scopeChanged && mutation.result.removedSpecIds.length > 0) {
      await this._changes.unscaffold(updatedChange, mutation.result.removedSpecIds)
    }
    if (mutation.result.scopeChanged) {
      await this._changes.scaffold(updatedChange, (specId) =>
        this._specExists(workspaceMap, specId),
      )
      if (this._refresh !== undefined) {
        await this._refresh.execute({ name: input.name })
        const reloaded = await this._changes.get(input.name)
        if (reloaded !== null) updatedChange = reloaded
      }
    }
    const validityChanged =
      mutation.projectionChanges.length > 0 || mutation.automaticReturn !== null
    return {
      change: updatedChange,
      invalidated: validityChanged,
      scopeChanged: mutation.result.scopeChanged,
      validityChanged,
      effectivePolicy: updatedChange.invalidationPolicy,
      projectionChanges: mutation.projectionChanges,
      affectedArtifacts: mutation.affectedArtifacts,
      automaticReturn: mutation.automaticReturn,
      blockers: mutation.verdict.blockers,
      nextAction: editNextAction(updatedChange, mutation.automaticReturn, validityChanged),
    }
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

/**
 * Same policy.
 *
 * @param left - left
 * @param right - right
 * @returns same policy result
 */
function samePolicy(left: InvalidationPolicy, right: InvalidationPolicy): boolean {
  return left.artifacts === right.artifacts && left.workflow === right.workflow
}

/**
 * Edit result.
 *
 * @param change - change
 * @param scopeChanged - scope changed
 * @param effectivePolicy - effective policy
 * @returns edit result result
 */
function editResult(
  change: Change,
  scopeChanged: boolean,
  effectivePolicy: InvalidationPolicy,
): EditChangeResult {
  return {
    change,
    invalidated: false,
    scopeChanged,
    validityChanged: false,
    effectivePolicy,
    projectionChanges: [],
    affectedArtifacts: [],
    automaticReturn: null,
    blockers: [],
    nextAction: editNextAction(change, null, false),
  }
}

/**
 * Derives delivery guidance from Core-owned recovery facts.
 *
 * @param change - Reconciled change
 * @param recovery - Automatic lifecycle return, when one was committed
 * @param validityChanged - Whether any validity projection changed
 * @returns Core-owned next action for adapters
 */
function editNextAction(
  change: Change,
  recovery: AutomaticRecovery | null,
  validityChanged: boolean,
): NextAction {
  if (recovery !== null) {
    return {
      targetStep: recovery.to,
      actionType: 'cognitive',
      reason: `Validity changed and returned the change to ${recovery.to}`,
      intent: recovery.to === 'designing' ? 'design' : 'verify',
    }
  }
  return {
    targetStep: change.state,
    actionType: validityChanged ? 'cognitive' : 'mechanical',
    reason: validityChanged
      ? 'Review validity blockers before advancing'
      : 'Change metadata updated',
    intent: null,
  }
}
