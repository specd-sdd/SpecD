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
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import {
  type LifecycleReviewSummary,
  type LifecycleBlocker,
  type LifecycleStepVerdict,
  projectArtifacts,
} from '../../domain/services/lifecycle-verdict.js'
import { evaluateLifecycle } from '../services/lifecycle-evaluation.js'
import {
  type CheckBinding,
  type CheckResult,
  type TaskCompletionCounts,
} from '../../domain/services/transition-checks.js'
import { Logger } from '../logger.js'
import {
  buildCheckExecutionContext,
  executeChecksByLegalTargets,
  executeMatchingPredicates,
} from '../services/execute-matching-predicates.js'
import {
  type ImplementationTrackingProjection,
  projectImplementationTracking,
} from './_shared/implementation-tracking.js'
import { RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import { type TaskCompletionStatus } from './count-tasks.js'

/** Input for the {@link GetStatus} use case. */
export interface GetStatusInput {
  /** The change name to look up. */
  readonly name: string
  /**
   * When omitted or `true`, refresh tracked implementation files before loading
   * status for active changes only. When `false`, skip refresh.
   */
  readonly refreshImplementationTracking?: boolean
  /**
   * Optional client revision timestamp (ISO 8601 or any value accepted by
   * `Date.parse`). When greater than or equal to `change.updatedAt`, the use
   * case returns early without re-evaluating full status.
   */
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

/**
 * Paints artifact task counts from `workflow.taskCompletion` details.
 *
 * @param checksByTarget - Predicate results per protocol-legal target
 * @returns Counts keyed by artifact id
 */
function taskCompletionFromChecks(
  checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>>,
): Readonly<Record<string, TaskCompletionCounts>> {
  const painted: Record<string, TaskCompletionCounts> = {}
  for (const rows of Object.values(checksByTarget)) {
    for (const check of rows ?? []) {
      if (check.id !== 'workflow.taskCompletion' || check.details === undefined) {
        continue
      }
      const byArtifact = check.details.byArtifact
      if (byArtifact !== undefined && typeof byArtifact === 'object' && byArtifact !== null) {
        for (const [artifactId, counts] of Object.entries(
          byArtifact as Record<string, TaskCompletionCounts>,
        )) {
          if (
            counts !== undefined &&
            typeof counts.complete === 'number' &&
            typeof counts.incomplete === 'number' &&
            typeof counts.total === 'number'
          ) {
            painted[artifactId] = counts
          }
        }
      }
    }
  }
  return painted
}

/** Completed vs incomplete task counts for one artifact type. */
export type { TaskCompletionStatus } from './count-tasks.js'

/** Status of a single artifact with file detail and dependency-aware effective status. */
export interface ArtifactStatusEntry {
  /** Artifact type identifier (e.g. `'proposal'`, `'spec'`). */
  readonly type: string
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
  /** Human prose when review is required. */
  readonly message?: string
  /** Affected artifacts and their concrete file paths. */
  readonly affectedArtifacts: readonly ReviewArtifactSummary[]
  /** Merged overlap entries from unhandled spec-overlap-conflict invalidations. */
  readonly overlapDetail: readonly ReviewOverlapEntry[]
}

/** Describes a specific condition blocking lifecycle progress. */
export interface Blocker {
  /** Machine-readable blocker code (e.g. 'ARTIFACT_DRIFT', 'INCOMPLETE_ARTIFACT'). */
  readonly code: string
  /** Human-readable explanation of the blocker. */
  readonly message: string
  /** CLI flag that skips this blocker when the predicate is skippable. */
  readonly bypassFlag?: string
  /** Gerund label from the failed check when projected from a predicate. */
  readonly label?: string
  /** Check id that produced this blocker when projected from a predicate. */
  readonly checkId?: string
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
  /** Subset of validTransitions whose blocking predicates passed or skipped. */
  readonly availableTransitions: readonly ChangeState[]
  /** Extras-bearing `schema.workflow()` rows from evaluateLifecycle (not protocol membership). */
  readonly availableSteps: readonly LifecycleStepVerdict[]
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
  /** Per-target predicate results from the same evaluate pass. */
  readonly checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>>
  /** Predicate rows for the happy-path nextAction candidate. */
  readonly checks: readonly CheckResult[]
}

/** Result returned by the {@link GetStatus} use case. */
export interface GetStatusResult {
  /** The loaded active change; absent when only a draft exists. */
  readonly change?: Change
  /** The drafted read model; absent for active changes. */
  readonly draftView?: DraftedChangeView
  /**
   * When `true`, the client revision matched or exceeded `change.updatedAt`
   * and full status evaluation was skipped.
   */
  readonly unchanged?: boolean
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
  private readonly _refresh: RefreshImplementationTracking
  private readonly _transitionBindings: readonly CheckBinding[]
  private readonly _archiveBindings: readonly CheckBinding[]

  /**
   * Creates a new `GetStatus` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param approvals - Whether approval gates are active
   * @param approvals.spec - Whether the spec approval gate is enabled
   * @param approvals.signoff - Whether the signoff gate is enabled
   * @param refreshImplementationTracking - Primitive for optional pre-read refresh
   * @param transitionBindings - Composed transition check bindings
   * @param archiveBindings - Composed archive check bindings (status in `archivable`)
   */
  constructor(
    changes: ChangeRepository,
    schemaProvider: SchemaProvider,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
    refreshImplementationTracking: RefreshImplementationTracking,
    transitionBindings: readonly CheckBinding[],
    archiveBindings: readonly CheckBinding[],
  ) {
    this._changes = changes
    this._schemaProvider = schemaProvider
    this._approvals = approvals
    this._refresh = refreshImplementationTracking
    this._transitionBindings = transitionBindings
    this._archiveBindings = archiveBindings
  }

  /**
   * Executes the use case.
   *
   * When `refreshImplementationTracking` is not `false`, active changes are
   * refreshed before status projection.
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
      return await this._buildDraftedResult(draftView)
    }

    if (input.ifModifiedSince !== undefined) {
      const clientRevision = Date.parse(input.ifModifiedSince)
      if (!Number.isNaN(clientRevision) && clientRevision >= change.updatedAt.getTime()) {
        return this._buildUnchangedResult(change)
      }
    }

    if (input.refreshImplementationTracking !== false) {
      await this._refresh.execute({ name: input.name })
    }

    const refreshedChange = await this._changes.get(input.name)
    if (refreshedChange === null) {
      throw new ChangeNotFoundError(input.name)
    }

    return this._buildActiveResult(refreshedChange)
  }

  /**
   * Builds the full status projection for an active change.
   *
   * @param change - Active change loaded from the repository
   * @returns Full status result
   */
  private async _buildActiveResult(change: Change): Promise<GetStatusResult> {
    const changePath = this._changes.changePath(change)
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
    let availableSteps: readonly LifecycleStepVerdict[] = []
    let transitionBlockers: readonly TransitionBlocker[] = []
    let nextArtifact: string | null = null
    let checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>> = {}
    let checks: readonly CheckResult[] = []

    let schema
    try {
      schema = await this._schemaProvider.get()
    } catch (err) {
      if (!(err instanceof SchemaNotFoundError)) {
        throw err
      }
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
          state: artifact.status,
          effectiveStatus: artifact.status,
          displayStatus: aggregateDisplayStatus(files),
          files,
        })
      }
      const lifecycle: LifecycleContext = {
        validTransitions,
        availableTransitions,
        availableSteps,
        blockers: transitionBlockers,
        approvals: this._approvals,
        nextArtifact,
        changePath,
        schemaInfo,
        checksByTarget,
        checks,
      }
      const specDependsOn: Record<string, string[]> = {}
      for (const [specId, deps] of change.specDependsOn) {
        specDependsOn[specId] = [...deps]
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

    schemaInfo = {
      name: schema.name(),
      version: schema.version(),
      artifacts: schema.artifacts(),
    }
    const projectedArtifacts = projectArtifacts(change, schema)
    const effectiveStatusByArtifact = new Map(
      projectedArtifacts.map((artifact) => [artifact.type, artifact.effectiveStatus]),
    )
    const passMemo = new Map<string, unknown>()
    const checksByTargetMap = await executeChecksByLegalTargets(this._transitionBindings, {
      change,
      schema,
      approvals: this._approvals,
      effectiveStatusByArtifact,
      passMemo,
    })
    let archiveChecks: readonly CheckResult[] = []
    if (change.state === 'archivable') {
      const archiveEvaluation = await executeMatchingPredicates(
        this._archiveBindings,
        buildCheckExecutionContext({
          change,
          schema,
          attempt: { scope: 'archive' },
          approvals: this._approvals,
          allowOverlap: false,
          allowOutOfScope: false,
          effectiveStatusByArtifact,
          passMemo,
        }),
      )
      archiveChecks = archiveEvaluation.checks
    }
    const verdict = evaluateLifecycle(change, schema, {
      approvals: this._approvals,
      checksByTarget: checksByTargetMap,
    })
    const artifactStatusByType = new Map(
      verdict.artifacts.map((artifact) => [artifact.type, artifact]),
    )
    const taskCompletionByArtifact = taskCompletionFromChecks(checksByTargetMap)

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

      const taskCompletion = taskCompletionByArtifact[type]
      artifactStatuses.push({
        type,
        state: artifact?.status ?? 'missing',
        effectiveStatus: artifactStatusByType.get(type)?.effectiveStatus ?? 'missing',
        displayStatus: aggregateDisplayStatus(files),
        files,
        ...(taskCompletion !== undefined ? { taskCompletion } : {}),
      })
    }

    review = this._projectReview(verdict.review, changePath)
    blockers = this._mergeBlockers(verdict.blockers, verdict.checksByTarget, archiveChecks)
    nextAction = this._nextActionAfterArchiveOverlap(verdict.nextAction, blockers)
    validTransitions = verdict.validTransitions
    availableTransitions = verdict.availableTransitions
    availableSteps = verdict.availableSteps
    transitionBlockers = verdict.transitionBlockers
    nextArtifact = verdict.nextArtifact
    checksByTarget = verdict.checksByTarget
    checks = verdict.checks

    Logger.debug('GetStatus projected evaluateLifecycle verdict', {
      change: change.name,
      blockerCodes: verdict.blockers.map((blocker) => blocker.code),
      reviewReason: verdict.review.reason,
      nextAction: verdict.nextAction.command,
    })

    const lifecycle: LifecycleContext = {
      validTransitions,
      availableTransitions,
      availableSteps,
      blockers: transitionBlockers,
      approvals: this._approvals,
      nextArtifact,
      changePath,
      schemaInfo,
      checksByTarget,
      checks,
    }

    const specDependsOn: Record<string, string[]> = {}
    for (const [specId, deps] of change.specDependsOn) {
      specDependsOn[specId] = [...deps]
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
   * Builds a short-circuited status result when the client revision is current.
   *
   * @param change - Active change loaded from the repository
   * @returns Minimal unchanged status result
   */
  private _buildUnchangedResult(change: Change): GetStatusResult {
    const changePath = this._changes.changePath(change)
    const specDependsOn: Record<string, string[]> = {}
    for (const [specId, deps] of change.specDependsOn) {
      specDependsOn[specId] = [...deps]
    }

    return {
      change,
      unchanged: true,
      artifactStatuses: [],
      specDependsOn,
      lifecycle: {
        validTransitions: VALID_TRANSITIONS[change.state],
        availableTransitions: [],
        availableSteps: [],
        blockers: [],
        approvals: this._approvals,
        nextArtifact: null,
        changePath,
        schemaInfo: null,
        checksByTarget: {},
        checks: [],
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
        reason: 'Client revision is current',
        command: null,
      },
    }
  }

  /**
   * Builds a read-only status result for a drafted change.
   *
   * @param draftView - Drafted change loaded via `getDraft`
   * @returns Status without lifecycle transitions or mutable `Change`
   */
  private async _buildDraftedResult(draftView: DraftedChangeView): Promise<GetStatusResult> {
    const changePath = this._changes.draftChangePath(draftView)
    const artifactStatuses: ArtifactStatusEntry[] = []
    const source = {
      name: draftView.name,
      artifacts: draftView.artifacts,
      getArtifact: (type: string) => draftView.artifacts.get(type) ?? null,
    }

    let schema
    try {
      schema = await this._schemaProvider.get()
    } catch (err) {
      if (!(err instanceof SchemaNotFoundError)) {
        throw err
      }
      schema = undefined
    }

    const projected = schema === undefined ? null : projectArtifacts(source, schema)
    const verdictByType = new Map((projected ?? []).map((artifact) => [artifact.type, artifact]))
    const artifactEntries =
      schema === undefined
        ? [...draftView.artifacts.entries()].map(([type, artifact]) => ({ type, artifact }))
        : schema.artifacts().map((artifactType) => ({
            type: artifactType.id,
            artifact: draftView.artifacts.get(artifactType.id) ?? null,
          }))

    for (const { type, artifact } of artifactEntries) {
      const files: ArtifactFileStatus[] =
        artifact === null
          ? []
          : [...artifact.files.values()].map((file) => ({
              key: file.key,
              filename: file.filename,
              state: file.status,
              ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
              hasDrift: file.hasDrift,
              displayStatus: file.displayStatus(),
            }))
      const projectedArtifact = verdictByType.get(type)
      artifactStatuses.push({
        type,
        state: artifact?.status ?? 'missing',
        effectiveStatus: projectedArtifact?.effectiveStatus ?? artifact?.status ?? 'missing',
        displayStatus: aggregateDisplayStatus(files),
        files,
      })
    }

    const lifecycle: LifecycleContext = {
      validTransitions: [],
      availableTransitions: [],
      availableSteps: [],
      blockers: [],
      approvals: this._approvals,
      nextArtifact: null,
      changePath,
      schemaInfo: {
        name: draftView.schemaName,
        version: draftView.schemaVersion,
        artifacts: schema === undefined ? [] : schema.artifacts(),
      },
      checksByTarget: {},
      checks: [],
    }

    const specDependsOn: Record<string, string[]> = {}
    for (const [specId, deps] of draftView.specDependsOn) {
      specDependsOn[specId] = [...deps]
    }

    return {
      draftView,
      artifactStatuses,
      specDependsOn,
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
   * Merges review blockers with failed predicates from every protocol-legal target.
   * Flattening is required so incomplete `verifying` tasks still surface while
   * `nextAction` remains `/specd-implement`.
   *
   * @param reviewBlockers - Verdict review/requested-target blockers
   * @param checksByTarget - Predicate results per protocol-legal target
   * @param archiveChecks - Archive-scope predicates when `state === 'archivable'`
   * @returns Deduplicated public blockers
   */
  private _mergeBlockers(
    reviewBlockers: readonly LifecycleBlocker[],
    checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>>,
    archiveChecks: readonly CheckResult[] = [],
  ): Blocker[] {
    const merged = new Map<string, Blocker>()
    for (const blocker of reviewBlockers) {
      merged.set(`${blocker.code}:${blocker.message}`, {
        code: blocker.code,
        message: blocker.message,
        ...(blocker.bypassFlag !== undefined ? { bypassFlag: blocker.bypassFlag } : {}),
        ...(blocker.label !== undefined ? { label: blocker.label } : {}),
        ...(blocker.checkId !== undefined ? { checkId: blocker.checkId } : {}),
      })
    }

    const checks = [
      ...Object.values(checksByTarget).flatMap((rows) => rows ?? []),
      ...archiveChecks,
    ]

    for (const check of checks) {
      if (check.outcome !== 'fail' || check.code === undefined) continue
      const message = check.message ?? `Check '${check.id}' failed`
      const key = `${check.code}:${message}`
      if (merged.has(key)) continue
      const linksInScopeSkippable =
        check.code === 'IMPLEMENTATION_STATE' && check.id === 'impl.linksInScope'
      const overlapSkippable = check.code === 'OVERLAP_CONFLICT'
      merged.set(key, {
        code: check.code,
        message,
        label: check.label,
        checkId: check.id,
        ...(linksInScopeSkippable ? { bypassFlag: '--allow-out-of-scope' } : {}),
        ...(overlapSkippable ? { bypassFlag: '--allow-overlap' } : {}),
      })
    }

    return [...merged.values()]
  }

  /**
   * Archive overlap is an operation predicate, not a hop, so the verdict can still
   * recommend "Ready to archive". Public status must not advertise a clean archive.
   *
   * @param nextAction - Application next-action projection
   * @param blockers - Merged public blockers including archive predicates
   * @returns Next action with overlap-aware reason when live overlap is present
   */
  private _nextActionAfterArchiveOverlap(
    nextAction: NextAction,
    blockers: readonly Blocker[],
  ): NextAction {
    const overlap = blockers.find((blocker) => blocker.code === 'OVERLAP_CONFLICT')
    if (overlap === undefined) {
      return nextAction
    }
    const bypass = overlap.bypassFlag ?? '--allow-overlap'
    const reason = overlap.message.includes(bypass)
      ? overlap.message
      : `${overlap.message} Use ${bypass} to archive anyway.`
    return {
      targetStep: 'archivable',
      actionType: 'mechanical',
      reason,
      command: '/specd-archive',
    }
  }

  /**
   * Projects verdict review details into the public GetStatus shape with absolute file paths.
   *
   * @param review - Verdict-derived review summary
   * @param changePath - Absolute path to the change directory
   * @returns Review summary with absolute file paths
   */
  private _projectReview(review: LifecycleReviewSummary, changePath: string): ReviewSummary {
    return {
      required: review.required,
      route: review.route,
      reason: review.reason,
      ...(review.message !== undefined ? { message: review.message } : {}),
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
