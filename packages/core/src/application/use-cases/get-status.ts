import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import { type DraftedChangeView } from '../../domain/read-only-change-view.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ArtifactDisplayStatus } from '../../domain/value-objects/artifact-display-status.js'
import { type ArtifactType } from '../../domain/value-objects/artifact-type.js'
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import {
  LifecycleEngine,
  type LifecycleReviewSummary,
} from '../../domain/services/lifecycle-engine.js'
import { safeRegex } from '../../domain/services/safe-regex.js'
import { Logger } from '../logger.js'
import {
  type ImplementationTrackingProjection,
  projectImplementationTracking,
} from './_shared/implementation-tracking.js'

/** Input for the {@link GetStatus} use case. */
export interface GetStatusInput {
  /** The change name to look up. */
  readonly name: string
  /** When set and still current, returns a short-circuit unchanged payload. */
  readonly ifModifiedSince?: string
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
  /** Whether the file's current state differs from its validated baseline. */
  readonly hasDrift: boolean
  /** Human-facing display status (may be `'complete-with-drift'`). */
  readonly displayStatus: ArtifactDisplayStatus
}

/** Display-state aggregation precedence for artifact-level status. */
const DISPLAY_STATUS_PRECEDENCE: readonly ArtifactDisplayStatus[] = [
  'drifted-pending-review',
  'pending-review',
  'in-progress',
  'missing',
  'complete-with-drift',
  'complete',
]

/**
 * Derives the aggregate display status for an artifact from its file-level
 * display statuses, using a fixed precedence ordering.
 *
 * @param files - File status entries to aggregate
 * @returns The highest-precedence display status across all files
 */
function aggregateDisplayStatus(files: readonly ArtifactFileStatus[]): ArtifactDisplayStatus {
  if (files.length === 0) return 'missing'
  if (files.every((f) => f.displayStatus === 'skipped')) return 'skipped'
  for (const candidate of DISPLAY_STATUS_PRECEDENCE) {
    if (files.some((f) => f.displayStatus === candidate)) return candidate
  }
  return files[0]!.displayStatus
}

/** Completed vs incomplete task counts for one artifact type. */
export interface TaskCompletionStatus {
  /** Count of completed task items. */
  readonly complete: number
  /** Count of incomplete task items. */
  readonly incomplete: number
  /** Total count of tracked task items. */
  readonly total: number
}

/** Status of a single artifact with file detail and dependency-aware effective status. */
export interface ArtifactStatusEntry {
  /** Artifact type identifier (e.g. `'proposal'`, `'spec'`). */
  readonly type: string
  /** Whether the schema marks this artifact type as task-capable. */
  readonly hasTasks: boolean
  /** Persisted aggregate artifact state. */
  readonly state: ArtifactStatus
  /** Effective status after cascading through required dependencies. */
  readonly effectiveStatus: ArtifactStatus
  /** Human-facing aggregated display status derived from file display states. */
  readonly displayStatus: ArtifactDisplayStatus
  /** Completed and incomplete task counts for task-capable artifacts, when available. */
  readonly taskCompletion?: TaskCompletionStatus
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
  /** When true, artifact DAG and lifecycle details were omitted as unchanged. */
  readonly unchanged?: boolean
  /** The loaded active change; absent when only a draft exists. */
  readonly change?: Change
  /** The drafted read model; absent for active changes. */
  readonly draftView?: DraftedChangeView
  /** Effective status for each artifact attached to the change. */
  readonly artifactStatuses: ArtifactStatusEntry[]
  /** Per-spec declared dependencies from the change manifest. */
  readonly specDependsOn: Record<string, string[]>
  /** Pre-computed lifecycle context. */
  readonly lifecycle: LifecycleContext
  /** Raw implementation-tracking projection. */
  readonly implementationTracking: ImplementationTrackingProjection
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
  private readonly _lifecycle: LifecycleEngine

  /**
   * Creates a new `GetStatus` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param approvals - Whether approval gates are active
   * @param approvals.spec - Whether the spec approval gate is enabled
   * @param approvals.signoff - Whether the signoff gate is enabled
   * @param lifecycle - Shared lifecycle interpreter
   */
  constructor(
    changes: ChangeRepository,
    schemaProvider: SchemaProvider,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
    lifecycle: LifecycleEngine = new LifecycleEngine(Logger.debug.bind(Logger)),
  ) {
    this._changes = changes
    this._schemaProvider = schemaProvider
    this._approvals = approvals
    this._lifecycle = lifecycle
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
      const draftView = await this._changes.getDraft(input.name)
      if (draftView === null) {
        throw new ChangeNotFoundError(input.name)
      }
      return this._buildDraftedResult(draftView)
    }

    const changePath = this._changes.changePath(change)
    const specDependsOn = this._projectSpecDependsOn(change.specDependsOn)

    if (input.ifModifiedSince !== undefined) {
      const clientRevision = Date.parse(input.ifModifiedSince)
      if (!Number.isNaN(clientRevision) && clientRevision >= change.updatedAt.getTime()) {
        return {
          change,
          unchanged: true,
          artifactStatuses: [],
          specDependsOn,
          lifecycle: {
            validTransitions: VALID_TRANSITIONS[change.state],
            availableTransitions: [],
            blockers: [],
            approvals: this._approvals,
            nextArtifact: null,
            changePath,
            schemaInfo: null,
          },
          implementationTracking: projectImplementationTracking(change),
          review: {
            required: false,
            route: null,
            reason: null,
            affectedArtifacts: [],
            overlapDetail: [],
          },
          blockers: [],
          nextAction: {
            targetStep: change.state,
            actionType: 'cognitive',
            reason: 'No change since last status poll',
            command: null,
          },
        }
      }
    }
    const artifactStatuses: ArtifactStatusEntry[] = []
    let schemaInfo: LifecycleContext['schemaInfo'] = null
    let review: ReviewSummary = {
      required: false,
      route: null,
      reason: null,
      affectedArtifacts: [],
      overlapDetail: [],
    }
    let blockers: Blocker[] = []
    let nextAction: NextAction = {
      targetStep: change.state,
      actionType: 'cognitive',
      reason: 'Proceed to next lifecycle step',
      command: null,
    }
    let validTransitions: readonly ChangeState[] = VALID_TRANSITIONS[change.state]
    let availableTransitions: readonly ChangeState[] = []
    let transitionBlockers: readonly TransitionBlocker[] = []
    let nextArtifact: string | null = null

    try {
      const schema = await this._schemaProvider.get()
      schemaInfo = {
        name: schema.name(),
        version: schema.version(),
        artifacts: schema.artifacts(),
      }
      const verdict = this._lifecycle.evaluate(change, schema, {
        approvals: this._approvals,
      })
      const artifactStatusByType = new Map(
        verdict.artifacts.map((artifact) => [artifact.type, artifact]),
      )

      for (const artifactType of schema.artifacts()) {
        const type = artifactType.id
        const artifact = change.getArtifact(type)
        const files: ArtifactFileStatus[] = []

        if (artifact !== null) {
          for (const file of artifact.files.values()) {
            files.push({
              key: file.key,
              filename: file.filename,
              state: file.status,
              ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
              hasDrift: file.hasDrift,
              displayStatus: file.displayStatus(),
            })
          }
        }

        artifactStatuses.push({
          type,
          hasTasks: artifactType.hasTasks,
          state: artifact?.status ?? 'missing',
          effectiveStatus: artifactStatusByType.get(type)?.effectiveStatus ?? 'missing',
          displayStatus: aggregateDisplayStatus(files),
          files,
        })
      }

      for (const artifactType of schemaInfo.artifacts) {
        if (!artifactType.hasTasks) continue
        const taskCheck = artifactType.taskCompletionCheck
        if (taskCheck?.incompletePattern === undefined) continue

        const statusIndex = artifactStatuses.findIndex((entry) => entry.type === artifactType.id)
        const changeArtifact = change.getArtifact(artifactType.id)
        if (statusIndex < 0 || changeArtifact === null) continue

        const incompleteRe = safeRegex(taskCheck.incompletePattern, 'gm')
        if (incompleteRe === null) continue

        const completeRe =
          taskCheck.completePattern !== undefined
            ? safeRegex(taskCheck.completePattern, 'gm')
            : null

        let incompleteCount = 0
        let completeCount = 0

        for (const file of changeArtifact.files.values()) {
          const loaded = await this._changes.artifact(change, file.filename)
          if (loaded === null || loaded.content.length === 0) continue

          incompleteCount += (loaded.content.match(incompleteRe) ?? []).length
          if (completeRe !== null) {
            completeCount += (loaded.content.match(completeRe) ?? []).length
          }
        }

        const total = incompleteCount + completeCount
        if (total === 0) continue

        const statusEntry = artifactStatuses[statusIndex]!
        artifactStatuses[statusIndex] = {
          ...statusEntry,
          taskCompletion: {
            complete: completeCount,
            incomplete: incompleteCount,
            total,
          },
        }
      }

      review = this._projectReview(verdict.review, changePath)
      blockers = verdict.blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
      }))
      nextAction = verdict.nextAction
      validTransitions = verdict.validTransitions
      availableTransitions = verdict.availableTransitions
      transitionBlockers = verdict.transitionBlockers
      nextArtifact = verdict.nextArtifact

      Logger.debug('GetStatus projected lifecycle engine verdict', {
        change: change.name,
        blockerCodes: verdict.blockers.map((blocker) => blocker.code),
        reviewReason: verdict.review.reason,
        nextAction: verdict.nextAction.command,
      })
    } catch {
      validTransitions = VALID_TRANSITIONS[change.state]
      for (const [type, artifact] of change.artifacts) {
        const files: ArtifactFileStatus[] = [...artifact.files.values()].map((file) => ({
          key: file.key,
          filename: file.filename,
          state: file.status,
          ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
          hasDrift: file.hasDrift,
          displayStatus: file.displayStatus(),
        }))
        artifactStatuses.push({
          type,
          hasTasks: false,
          state: artifact.status,
          effectiveStatus: artifact.status,
          displayStatus: aggregateDisplayStatus(files),
          files,
        })
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

    return {
      change,
      artifactStatuses,
      specDependsOn,
      lifecycle,
      implementationTracking: projectImplementationTracking(change),
      review,
      blockers,
      nextAction,
    }
  }

  /**
   * Builds a read-only status result for a drafted change.
   *
   * @param draftView - Drafted change loaded via `getDraft`
   * @returns Status without lifecycle transitions or mutable `Change`
   */
  private _buildDraftedResult(draftView: DraftedChangeView): GetStatusResult {
    const changePath = this._changes.draftChangePath(draftView)
    const artifactStatuses: ArtifactStatusEntry[] = []

    for (const [type, artifact] of draftView.artifacts) {
      const files: ArtifactFileStatus[] = [...artifact.files.values()].map((file) => ({
        key: file.key,
        filename: file.filename,
        state: file.status,
        ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
        hasDrift: file.hasDrift,
        displayStatus: file.displayStatus(),
      }))
      artifactStatuses.push({
        type,
        hasTasks: false,
        state: artifact.status,
        effectiveStatus: artifact.status,
        displayStatus: aggregateDisplayStatus(files),
        files,
      })
    }

    const lifecycle: LifecycleContext = {
      validTransitions: [],
      availableTransitions: [],
      blockers: [],
      approvals: this._approvals,
      nextArtifact: null,
      changePath,
      schemaInfo: {
        name: draftView.schemaName,
        version: draftView.schemaVersion,
        artifacts: [],
      },
    }

    return {
      draftView,
      artifactStatuses,
      specDependsOn: this._projectSpecDependsOn(draftView.specDependsOn),
      lifecycle,
      implementationTracking: { trackedFiles: [], links: [] },
      review: {
        required: false,
        route: null,
        reason: null,
        affectedArtifacts: [],
        overlapDetail: [],
      },
      blockers: [],
      nextAction: {
        targetStep: draftView.state,
        actionType: 'cognitive',
        reason: 'Change is drafted; restore before lifecycle transitions',
        command: null,
      },
    }
  }

  /**
   * Clones manifest spec-dependency declarations into a serializable result object.
   *
   * @param specDependsOn - Persisted dependency map from a change or drafted view
   * @returns Plain object copy of declared spec dependencies
   */
  private _projectSpecDependsOn(
    specDependsOn: ReadonlyMap<string, readonly string[]>,
  ): Record<string, string[]> {
    const projected: Record<string, string[]> = {}
    for (const [specId, deps] of specDependsOn) {
      projected[specId] = [...deps]
    }
    return projected
  }

  /**
   * Projects engine review details into the public GetStatus shape with absolute file paths.
   *
   * @param review - Engine-derived review summary
   * @param changePath - Absolute path to the change directory
   * @returns Review summary with absolute file paths
   */
  private _projectReview(review: LifecycleReviewSummary, changePath: string): ReviewSummary {
    return {
      required: review.required,
      route: review.route,
      reason: review.reason,
      affectedArtifacts: review.affectedArtifacts.map((artifact) => ({
        type: artifact.type,
        files: artifact.files.map((file) => ({
          key: file.key,
          filename: file.filename,
          path: path.resolve(changePath, file.filename),
        })),
      })),
      overlapDetail: review.overlapDetail.map((entry) => ({
        archivedChangeName: entry.archivedChangeName,
        overlappingSpecIds: [...entry.overlappingSpecIds],
      })),
    }
  }
}
