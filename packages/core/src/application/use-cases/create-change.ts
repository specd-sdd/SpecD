import { Change, type CreatedEvent } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { ChangeAlreadyExistsError } from '../errors/change-already-exists-error.js'
import { InvalidCreateChangeInputError } from '../errors/invalid-create-change-input-error.js'
import { type InvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { OverlapReport } from '../../domain/value-objects/overlap-report.js'
import { loadPersistedSpecDependsOn } from './_shared/load-persisted-spec-depends-on.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'
import { type GetActiveSchema } from './get-active-schema.js'
import { type DetectOverlap } from './detect-overlap.js'

/** Result returned by the {@link CreateChange} use case. */
export interface CreateChangeResult {
  /** The newly created change entity. */
  readonly change: Change
  /** Absolute filesystem path to the change directory. */
  readonly changePath: string
  /** Overlap report when {@link CreateChangeInput.includeOverlapCheck} was requested. */
  readonly overlapReport?: OverlapReport
}

/** Input for the {@link CreateChange} use case. */
export interface CreateChangeInput {
  /** Unique slug name for the new change (e.g. `'add-oauth-login'`). */
  readonly name: string
  /** Optional free-text description of the change's purpose. */
  readonly description?: string
  /** Spec paths being created or modified by this change. */
  readonly specIds: readonly string[]
  /** Explicit schema name override. When omitted, resolved via {@link GetActiveSchema}. */
  readonly schemaName?: string
  /** Explicit schema version override. When omitted, resolved via {@link GetActiveSchema}. */
  readonly schemaVersion?: number
  /** Invalidation policy to seed on the new change. Defaults to `'downstream'`. */
  readonly invalidationPolicy?: InvalidationPolicy
  /** When `true` and `specIds` is non-empty, run overlap detection after persistence. */
  readonly includeOverlapCheck?: boolean
}

/** Effective schema identity recorded on the created event. */
interface ResolvedSchemaIdentity {
  /** Effective schema name for the created event. */
  readonly schemaName: string
  /** Effective schema version for the created event. */
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
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _actor: ActorResolver
  private readonly _getActiveSchema: GetActiveSchema
  private readonly _detectOverlap: DetectOverlap

  /**
   * Creates a new `CreateChange` use case instance.
   *
   * @param changes - Repository for persisting the new change
   * @param listWorkspaces - The project orchestrator
   * @param actor - Resolver for the actor identity
   * @param getActiveSchema - Resolves the project's active schema when not overridden on input
   * @param detectOverlap - Detects spec overlap across active changes
   */
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    actor: ActorResolver,
    getActiveSchema: GetActiveSchema,
    detectOverlap: DetectOverlap,
  ) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
    this._actor = actor
    this._getActiveSchema = getActiveSchema
    this._detectOverlap = detectOverlap
  }

  /**
   * Executes the use case.
   *
   * @param input - Creation parameters
   * @returns The newly created change and its filesystem path
   * @throws {ChangeAlreadyExistsError} If a change with the given name already exists
   * @throws {InvalidCreateChangeInputError} When only one of `schemaName` or `schemaVersion` is provided
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

    const { schemaName, schemaVersion } = await this._resolveSchemaIdentity(input)

    const actor = await this._actor.identity()
    const now = new Date()

    const created: CreatedEvent = {
      type: 'created',
      at: now,
      by: actor,
      specIds: input.specIds,
      schemaName,
      schemaVersion,
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

    let overlapReport: OverlapReport | undefined
    if (input.includeOverlapCheck === true && input.specIds.length > 0) {
      try {
        overlapReport = await this._detectOverlap.execute({ name: input.name })
      } catch {
        // Overlap detection is best-effort — do not fail creation
      }
    }

    return {
      change,
      changePath,
      ...(overlapReport !== undefined ? { overlapReport } : {}),
    }
  }

  /**
   * Resolves effective schema identity from input override or active schema.
   *
   * @param input - Creation parameters
   * @returns Schema name and version for the created event
   */
  private async _resolveSchemaIdentity(input: CreateChangeInput): Promise<ResolvedSchemaIdentity> {
    const { schemaName, schemaVersion } = input
    if (schemaName !== undefined && schemaVersion !== undefined) {
      return { schemaName, schemaVersion }
    }
    if (schemaName !== undefined || schemaVersion !== undefined) {
      throw new InvalidCreateChangeInputError(
        'schemaName and schemaVersion must both be provided or both omitted',
      )
    }

    const result = await this._getActiveSchema.execute()
    if (result.raw) {
      throw new Error('Unexpected raw schema result from GetActiveSchema')
    }

    return {
      schemaName: result.schema.name(),
      schemaVersion: result.schema.version(),
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
