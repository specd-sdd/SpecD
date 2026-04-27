import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ArtifactType } from '../../domain/value-objects/artifact-type.js'
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { type InvalidatedEvent } from '../../domain/entities/change.js'

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
  /** Persisted state of this individual file. */
  readonly state: ArtifactStatus
  /** Last validated hash for this file, when present. */
  readonly validatedHash?: string
}

/** Status of a single artifact with file detail and dependency-aware effective status. */
export interface ArtifactStatusEntry {
  /** Artifact type identifier (e.g. `'proposal'`, `'spec'`). */
  readonly type: string
  /** Persisted aggregate artifact state. */
  readonly state: ArtifactStatus
  /** Effective status after cascading through required dependencies. */
  readonly effectiveStatus: ArtifactStatus
  /** Per-file status details. */
  readonly files: ArtifactFileStatus[]
}

/** Review routing summary for agents and operators. */
export interface ReviewArtifactFileSummary {
  /** Supplemental file key used internally for manifest/history matching. */
  readonly key: string
  /** Relative filename within the change directory. */
  readonly filename: string
  /** Absolute filesystem path to the affected file. */
  readonly path: string
}

/** Review routing summary for one affected artifact. */
export interface ReviewArtifactSummary {
  /** Artifact type identifier. */
  readonly type: string
  /** Concrete affected files within that artifact. */
  readonly files: readonly ReviewArtifactFileSummary[]
}

/** Describes a single archived change whose overlap invalidated this change. */
export interface ReviewOverlapEntry {
  readonly archivedChangeName: string
  readonly overlappingSpecIds: readonly string[]
}

/** Review routing summary for agents and operators. */
export interface ReviewSummary {
  /** Whether the change currently requires artifact review. */
  readonly required: boolean
  /** Recommended workflow route when review is required. */
  readonly route: 'designing' | null
  /** Primary review reason derived from current file states. */
  readonly reason: 'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' | null
  /** Affected artifacts and their concrete file paths. */
  readonly affectedArtifacts: readonly ReviewArtifactSummary[]
  /** Merged overlap entries from unhandled spec-overlap-conflict invalidations. */
  readonly overlapDetail: readonly ReviewOverlapEntry[]
}

/** Describes a specific condition blocking lifecycle progress. */
export interface Blocker {
  /** Machine-readable blocker code (e.g. 'ARTIFACT_DRIFT', 'MISSING_ARTIFACT'). */
  readonly code: string
  /** Human-readable explanation of the blocker. */
  readonly message: string
}

/** A recommended next step for the user or agent. */
export interface NextAction {
  /** The lifecycle step this action targets. */
  readonly targetStep: ChangeState
  /** Whether the action requires human/agent thought or is purely mechanical. */
  readonly actionType: 'cognitive' | 'mechanical'
  /** Human-readable rationale for the recommendation. */
  readonly reason: string
  /** The recommended CLI command or skill to run. */
  readonly command: string | null
}

/** Describes why a structurally valid transition is not currently available. */
export interface TransitionBlocker {
  /** The blocked target state. */
  readonly transition: ChangeState
  /** Why the transition is blocked. */
  readonly reason: 'requires' | 'tasks-incomplete'
  /** Artifact IDs whose persisted state is neither complete nor skipped. */
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
  /** Active schema name, version and artifacts, or null when schema resolution fails. */
  readonly schemaInfo: {
    readonly name: string
    readonly version: number
    readonly artifacts: readonly ArtifactType[]
  } | null
}

/** Result returned by the {@link GetStatus} use case. */
export interface GetStatusResult {
  /** The loaded change with its current artifact state. */
  readonly change: Change
  /** Effective status for each artifact attached to the change. */
  readonly artifactStatuses: ArtifactStatusEntry[]
  /** Pre-computed lifecycle context. */
  readonly lifecycle: LifecycleContext
  /** Whether validated artifacts require review before continuing. */
  readonly review: ReviewSummary
  /** High-visibility blockers preventing progress. */
  readonly blockers: readonly Blocker[]
  /** Recommended next action. */
  readonly nextAction: NextAction
}

/**
 * Loads a change and reports its current lifecycle state and artifact statuses.
 *
 * The result exposes both the persisted artifact/file state and the
 * dependency-aware effective status used for legacy lifecycle explanations.
 */
export class GetStatus {
  private readonly _changes: ChangeRepository
  private readonly _schemaProvider: SchemaProvider
  private readonly _approvals: { readonly spec: boolean; readonly signoff: boolean }

  /**
   * Creates a new `GetStatus` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param approvals - Whether approval gates are active
   * @param approvals.spec - Whether the spec approval gate is enabled
   * @param approvals.signoff - Whether the signoff gate is enabled
   */
  constructor(
    changes: ChangeRepository,
    schemaProvider: SchemaProvider,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
  ) {
    this._changes = changes
    this._schemaProvider = schemaProvider
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
        files.push({
          key,
          filename: file.filename,
          state: file.status,
          ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
        })
      }
      artifactStatuses.push({
        type,
        state: artifact.status,
        effectiveStatus: change.effectiveStatus(type),
        files,
      })
    }

    const changePath = this._changes.changePath(change)
    const review = this._deriveReview(change, artifactStatuses, changePath)

    // --- Lifecycle computation ---

    // 1. Valid transitions (static, always works)
    const validTransitions = VALID_TRANSITIONS[change.state]

    // 2. Resolve schema (may fail — graceful degradation)
    let schema: Schema | null = null
    let schemaInfo: LifecycleContext['schemaInfo'] = null
    try {
      schema = await this._schemaProvider.get()
      schemaInfo = {
        name: schema.name(),
        version: schema.version(),
        artifacts: schema.artifacts(),
      }
    } catch {
      // Schema-dependent fields will use defaults
    }

    // 3. Available transitions and blockers
    const availableTransitions: ChangeState[] = []
    const transitionBlockers: TransitionBlocker[] = []

    if (schema !== null) {
      for (const target of validTransitions) {
        const workflowStep = schema.workflowStep(target)
        if (workflowStep === null || workflowStep.requires.length === 0) {
          availableTransitions.push(target)
          continue
        }
        const blocking: string[] = []
        for (const artifactId of workflowStep.requires) {
          const status = change.getArtifact(artifactId)?.status
          if (status !== 'complete' && status !== 'skipped') {
            blocking.push(artifactId)
          }
        }
        if (blocking.length === 0) {
          availableTransitions.push(target)
        } else {
          transitionBlockers.push({ transition: target, reason: 'requires', blocking })
        }
      }
    }

    // 4. Next artifact
    let nextArtifact: string | null = null
    if (schema !== null) {
      for (const artifactType of schema.artifacts()) {
        const ownStatus = change.getArtifact(artifactType.id)?.status ?? 'missing'
        if (ownStatus === 'complete' || ownStatus === 'skipped') {
          continue
        }
        const requiresSatisfied = artifactType.requires.every((reqId) => {
          const reqStatus = change.getArtifact(reqId)?.status
          return reqStatus === 'complete' || reqStatus === 'skipped'
        })
        if (requiresSatisfied) {
          nextArtifact = artifactType.id
          break
        }
      }
    }

    const lifecycle: LifecycleContext = {
      validTransitions,
      availableTransitions,
      blockers: transitionBlockers,
      approvals: this._approvals,
      nextArtifact,
      changePath,
      schemaInfo,
    }

    const blockers = this._deriveBlockers(review, transitionBlockers, change)
    const nextAction = this._deriveNextAction(change.state, review, availableTransitions)

    return { change, artifactStatuses, lifecycle, review, blockers, nextAction }
  }

  /**
   * Identifies explicit blockers that prevent lifecycle progression.
   *
   * @param review - Current review summary
   * @param transitionBlockers - Structural transition blockers
   * @param change - Loaded change entity
   * @returns Array of active blockers
   */
  private _deriveBlockers(
    review: ReviewSummary,
    transitionBlockers: TransitionBlocker[],
    change: Change,
  ): Blocker[] {
    const blockers: Blocker[] = []

    if (review.reason === 'artifact-drift') {
      blockers.push({
        code: 'ARTIFACT_DRIFT',
        message: 'Validated artifact content drifted from disk',
      })
    } else if (review.reason === 'spec-overlap-conflict') {
      blockers.push({
        code: 'OVERLAP_CONFLICT',
        message: 'Conflict detected with archived overlapping specs',
      })
    } else if (review.reason === 'artifact-review-required') {
      blockers.push({
        code: 'REVIEW_REQUIRED',
        message: 'Artifacts require review before proceeding',
      })
    }

    // Identify missing required artifacts for next step
    const nextStepBlocker = transitionBlockers.find((b) => b.reason === 'requires')
    if (nextStepBlocker) {
      for (const artifactId of nextStepBlocker.blocking) {
        const artifact = change.getArtifact(artifactId)
        if (!artifact || artifact.status === 'missing' || artifact.status === 'in-progress') {
          blockers.push({
            code: 'MISSING_ARTIFACT',
            message: `Required artifact '${artifactId}' is incomplete`,
          })
        }
      }
    }

    return blockers
  }

  /**
   * Recommends the next action to guide the agent or user.
   *
   * @param state - Current change state
   * @param review - Current review summary
   * @param availableTransitions - Transitions currently available
   * @returns NextAction recommendation
   */
  private _deriveNextAction(
    state: ChangeState,
    review: ReviewSummary,
    availableTransitions: ChangeState[],
  ): NextAction {
    if (review.required) {
      return {
        targetStep: state,
        actionType: 'cognitive',
        reason: review.reason ?? 'Review required',
        command: '/specd-design',
      }
    }

    if (state === 'drafting' || state === 'designing') {
      return {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Elaborating design artifacts',
        command: '/specd-design',
      }
    }

    if (state === 'ready' && availableTransitions.includes('implementing')) {
      return {
        targetStep: 'implementing',
        actionType: 'mechanical',
        reason: 'Design complete, ready to implement',
        command: '/specd-implement',
      }
    }

    if (state === 'implementing') {
      return {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Implementing planned tasks',
        command: '/specd-implement',
      }
    }

    if (state === 'verifying') {
      return {
        targetStep: 'verifying',
        actionType: 'mechanical',
        reason: 'Verifying implementation against scenarios',
        command: '/specd-verify',
      }
    }

    return {
      targetStep: state,
      actionType: 'cognitive',
      reason: 'Proceed to next lifecycle step',
      command: null,
    }
  }

  /**
   * Derives the outward-facing review summary from current artifact/file states.
   *
   * @param change - Change whose history may refine the affected-file ordering
   * @param artifactStatuses - Current persisted artifact/file states
   * @param changePath - Absolute path to the change directory
   * @returns A stable review summary for CLI and skills
   */
  private _deriveReview(
    change: Change,
    artifactStatuses: ArtifactStatusEntry[],
    changePath: string,
  ): ReviewSummary {
    const outstandingFilesByArtifact = new Map<string, Map<string, ReviewArtifactFileSummary>>()
    for (const artifact of artifactStatuses) {
      const files = artifact.files
        .filter(
          (file) => file.state === 'pending-review' || file.state === 'drifted-pending-review',
        )
        .map((file) => ({
          key: file.key,
          filename: file.filename,
          path: path.resolve(changePath, file.filename),
        }))

      if (files.length === 0) continue
      outstandingFilesByArtifact.set(artifact.type, new Map(files.map((file) => [file.key, file])))
    }

    if (outstandingFilesByArtifact.size === 0) {
      return {
        required: false,
        route: null,
        reason: null,
        affectedArtifacts: [],
        overlapDetail: [],
      }
    }

    const latestInvalidated = [...change.history]
      .reverse()
      .find((event): event is InvalidatedEvent => event.type === 'invalidated')
    const hasDrift = artifactStatuses.some((artifact) =>
      artifact.files.some((file) => file.state === 'drifted-pending-review'),
    )

    const unhandledOverlaps = this._collectUnhandledOverlaps(change)
    const overlapReason: 'spec-overlap-conflict' | null =
      !hasDrift && unhandledOverlaps.length > 0 ? 'spec-overlap-conflict' : null

    const projectedLatestAffectedArtifacts =
      latestInvalidated === undefined
        ? []
        : latestInvalidated.affectedArtifacts
            .map((artifact): ReviewArtifactSummary | null => {
              const currentFiles = outstandingFilesByArtifact.get(artifact.type)
              if (currentFiles === undefined) return null
              const files = artifact.files
                .map((fileKey) => currentFiles.get(fileKey))
                .filter((file): file is ReviewArtifactFileSummary => file !== undefined)
              return files.length === 0 ? null : { type: artifact.type, files }
            })
            .filter((artifact): artifact is ReviewArtifactSummary => artifact !== null)

    const fallbackAffectedArtifacts: ReviewArtifactSummary[] = [
      ...outstandingFilesByArtifact.entries(),
    ].map(([type, files]) => ({
      type,
      files: [...files.values()],
    }))

    return {
      required: true,
      route: 'designing',
      reason: hasDrift ? 'artifact-drift' : (overlapReason ?? 'artifact-review-required'),
      affectedArtifacts:
        projectedLatestAffectedArtifacts.length > 0
          ? projectedLatestAffectedArtifacts
          : fallbackAffectedArtifacts,
      overlapDetail: overlapReason !== null ? unhandledOverlaps : [],
    }
  }

  /**
   * Collects unhandled spec-overlap-conflict invalidation events from history.
   *
   * Scans in reverse, collecting events until a forward-transition boundary
   * is reached (a transition to a non-designing state).
   *
   * @param change - The change whose history to scan
   * @returns Overlap entries ordered newest-first
   */
  private _collectUnhandledOverlaps(change: Change): ReviewOverlapEntry[] {
    const entries: ReviewOverlapEntry[] = []
    for (const event of [...change.history].reverse()) {
      if (event.type === 'invalidated' && event.cause === 'spec-overlap-conflict') {
        const nameMatch = event.message.match(/change '([^']+)'/)
        const specsMatch = event.message.match(/specs:\s*(.+)$/)
        entries.push({
          archivedChangeName: nameMatch?.[1] ?? '',
          overlappingSpecIds: specsMatch?.[1]?.split(',').map((s) => s.trim()) ?? [],
        })
        continue
      }
      if (event.type === 'transitioned' && event.to !== 'designing') {
        break
      }
    }
    return entries
  }
}
