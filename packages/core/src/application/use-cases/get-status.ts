import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
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
import { Logger } from '../logger.js'

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
      throw new ChangeNotFoundError(input.name)
    }

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
          effectiveStatus: artifactStatusByType.get(type)?.effectiveStatus ?? artifact.status,
          displayStatus: aggregateDisplayStatus(files),
          files,
        })
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

    return { change, artifactStatuses, lifecycle, review, blockers, nextAction }
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
