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
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { loadPersistedSpecDependsOn } from './_shared/load-persisted-spec-depends-on.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'
import { InvalidCompositionFactoryArgumentsError } from '../../domain/errors/invalid-composition-factory-arguments-error.js'

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
  private readonly _reconcile: ReconcileChangeValidity

  /**
   * Creates a new `EditChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param listWorkspaces - The project orchestrator
   * @param actor - Resolver for the actor identity
   * @param schemaProvider - Provider for the active schema DAG
   * @param refreshImplementationTracking - Optional refresh handler for implementation tracking cleanup
   * @param reconcile - Canonical reconciler for scope edits
   */
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    actor: ActorResolver,
    schemaProvider: SchemaProvider,
    refreshImplementationTracking?: RefreshImplementationTracking,
    reconcile?: ReconcileChangeValidity,
  ) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
    this._actor = actor
    this._schemaProvider = schemaProvider
    this._refresh = refreshImplementationTracking
    if (reconcile === undefined) {
      throw new InvalidCompositionFactoryArgumentsError('EditChange', 'reconcile is required')
    }
    this._reconcile = reconcile
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

    const hasDescriptionChange = input.description !== undefined
    const resolvedPolicy = resolveInvalidationPolicy(change.invalidationPolicy, input.invalidation)
    const policyChanged = !samePolicy(change.invalidationPolicy, resolvedPolicy)
    const hasSpecChanges =
      (input.addSpecIds !== undefined && input.addSpecIds.length > 0) ||
      (input.removeSpecIds !== undefined && input.removeSpecIds.length > 0)

    if (!hasDescriptionChange && !hasSpecChanges && !policyChanged) {
      return editResult(change, false, resolvedPolicy)
    }

    const actor = await this._actor.identity()
    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    if (hasSpecChanges) {
      return this._executeScopeEdit(
        input,
        actor,
        workspaceMap,
        resolvedPolicy,
        policyChanged,
        hasDescriptionChange,
      )
    }

    const { result: persisted, change: initialChange } = await this._changes.mutate(
      input.name,
      async (freshChange) => {
        let specIdsChanged = false
        let removedSpecIds: string[] = []
        let addedSpecIds: string[] = []

        if (hasSpecChanges) {
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
          addedSpecIds = specIds.filter((id) => !currentSpecIds.includes(id))
          specIdsChanged =
            specIds.length !== currentSpecIds.length ||
            specIds.some((id, i) => id !== currentSpecIds[i])

          if (specIdsChanged) {
            removedSpecIds = currentSpecIds.filter((id) => !specIds.includes(id))
            const schema = await this._schemaProvider.get()
            freshChange.updateSpecIds(specIds, actor, schema.artifactDag())
            for (const specId of addedSpecIds) {
              if (freshChange.specDependsOn.get(specId) !== undefined) continue
              const persistedDeps = await loadPersistedSpecDependsOn(workspaceMap, specId)
              freshChange.setSpecDependsOn(specId, persistedDeps.dependsOn)
            }
          }
        }

        if (hasDescriptionChange) {
          freshChange.updateDescription(input.description ?? '', actor)
        }

        if (policyChanged) {
          freshChange.invalidationPolicy = resolvedPolicy
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

    return editResult(updatedChange, persisted.invalidated, resolvedPolicy)
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
    const mutation = await this._reconcile.mutate({ name: input.name }, async (ctx) => {
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
    const { workspace, capPath } = parseSpecId(specId)
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
      command: recovery.to === 'designing' ? '/specd-design' : '/specd-verify',
    }
  }
  return {
    targetStep: change.state,
    actionType: validityChanged ? 'cognitive' : 'mechanical',
    reason: validityChanged
      ? 'Review validity blockers before advancing'
      : 'Change metadata updated',
    command: null,
  }
}
