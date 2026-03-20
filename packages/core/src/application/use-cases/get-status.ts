import { type Change } from '../../domain/entities/change.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link GetStatus} use case. */
export interface GetStatusInput {
  /** The change name to look up. */
  readonly name: string
}

/** Per-file status detail within an artifact. */
export interface ArtifactFileStatus {
  /** File key (artifact type id for scope:change, specId for scope:spec). */
  readonly key: string
  /** Filename (basename). */
  readonly filename: string
  /** Status of this individual file. */
  readonly status: ArtifactStatus
}

/** Effective status of a single artifact, after dependency cascade. */
export interface ArtifactStatusEntry {
  /** Artifact type identifier (e.g. `'proposal'`, `'spec'`). */
  readonly type: string
  /** Effective status after cascading through required dependencies. */
  readonly effectiveStatus: ArtifactStatus
  /** Per-file status details. */
  readonly files: ArtifactFileStatus[]
}

/** Describes why a structurally valid transition is not currently available. */
export interface TransitionBlocker {
  /** The blocked target state. */
  readonly transition: ChangeState
  /** Why the transition is blocked. */
  readonly reason: 'requires' | 'tasks-incomplete'
  /** Artifact IDs whose effective status is neither complete nor skipped. */
  readonly blocking: readonly string[]
}

/** Pre-computed lifecycle context for driving the change lifecycle. */
export interface LifecycleContext {
  /** All structurally valid transitions from the current state. */
  readonly validTransitions: readonly ChangeState[]
  /** Subset of validTransitions where workflow requires are satisfied. */
  readonly availableTransitions: readonly ChangeState[]
  /** For each valid-but-unavailable transition, what's blocking it. */
  readonly blockers: readonly TransitionBlocker[]
  /** Whether approval gates are active in the project config. */
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  /** Next artifact in the DAG whose requires are satisfied but is not yet complete/skipped. */
  readonly nextArtifact: string | null
  /** Filesystem path to the change directory. */
  readonly changePath: string
  /** Active schema name and version, or null when schema resolution fails. */
  readonly schemaInfo: { readonly name: string; readonly version: number } | null
}

/** Result returned by the {@link GetStatus} use case. */
export interface GetStatusResult {
  /** The loaded change with its current artifact state. */
  readonly change: Change
  /** Effective status for each artifact attached to the change. */
  readonly artifactStatuses: ArtifactStatusEntry[]
  /** Pre-computed lifecycle context. */
  readonly lifecycle: LifecycleContext
}

/**
 * Loads a change and reports its current lifecycle state and artifact statuses.
 *
 * Artifact statuses are computed via {@link Change.effectiveStatus}, which
 * cascades through artifact dependency chains — an artifact with all hashes
 * matching is still `in-progress` if any of its dependencies are not `complete`.
 */
export class GetStatus {
  private readonly _changes: ChangeRepository
  private readonly _schemas: SchemaRegistry
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>
  private readonly _approvals: { readonly spec: boolean; readonly signoff: boolean }

  /**
   * Creates a new `GetStatus` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param schemas - Registry for resolving the active schema
   * @param schemaRef - Schema reference string from project config
   * @param workspaceSchemasPaths - Workspace-to-schemas-path map for schema resolution
   * @param approvals - Whether approval gates are active
   * @param approvals.spec - Whether the spec approval gate is enabled
   * @param approvals.signoff - Whether the signoff gate is enabled
   */
  constructor(
    changes: ChangeRepository,
    schemas: SchemaRegistry,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
  ) {
    this._changes = changes
    this._schemas = schemas
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
    this._approvals = approvals
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The change and its artifact statuses
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: GetStatusInput): Promise<GetStatusResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const artifactStatuses: ArtifactStatusEntry[] = []
    for (const [type, artifact] of change.artifacts) {
      const files: ArtifactFileStatus[] = []
      for (const [key, file] of artifact.files) {
        files.push({ key, filename: file.filename, status: file.status })
      }
      artifactStatuses.push({ type, effectiveStatus: change.effectiveStatus(type), files })
    }

    // --- Lifecycle computation ---

    // 1. Valid transitions (static, always works)
    const validTransitions = VALID_TRANSITIONS[change.state]

    // 2. Resolve schema (may fail)
    let schema: Awaited<ReturnType<SchemaRegistry['resolve']>> = null
    let schemaInfo: LifecycleContext['schemaInfo'] = null
    try {
      schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
      if (schema !== null) {
        schemaInfo = { name: schema.name(), version: schema.version() }
      }
    } catch {
      // Graceful degradation — schema-dependent fields will use defaults
    }

    // 3. Available transitions and blockers
    const availableTransitions: ChangeState[] = []
    const blockers: TransitionBlocker[] = []

    if (schema !== null) {
      for (const target of validTransitions) {
        const workflowStep = schema.workflowStep(target)
        if (workflowStep === null || workflowStep.requires.length === 0) {
          availableTransitions.push(target)
          continue
        }
        const blocking: string[] = []
        for (const artifactId of workflowStep.requires) {
          const status = change.effectiveStatus(artifactId)
          if (status !== 'complete' && status !== 'skipped') {
            blocking.push(artifactId)
          }
        }
        if (blocking.length === 0) {
          availableTransitions.push(target)
        } else {
          blockers.push({ transition: target, reason: 'requires', blocking })
        }
      }
    }

    // 4. Next artifact
    let nextArtifact: string | null = null
    if (schema !== null) {
      for (const artifactType of schema.artifacts()) {
        const ownStatus = change.effectiveStatus(artifactType.id)
        if (ownStatus === 'complete' || ownStatus === 'skipped') {
          continue
        }
        const requiresSatisfied = artifactType.requires.every((reqId) => {
          const reqStatus = change.effectiveStatus(reqId)
          return reqStatus === 'complete' || reqStatus === 'skipped'
        })
        if (requiresSatisfied) {
          nextArtifact = artifactType.id
          break
        }
      }
    }

    // 5. Change path
    const changePath = this._changes.changePath(change)

    const lifecycle: LifecycleContext = {
      validTransitions,
      availableTransitions,
      blockers,
      approvals: this._approvals,
      nextArtifact,
      changePath,
      schemaInfo,
    }

    return { change, artifactStatuses, lifecycle }
  }
}
