import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { safeRegex } from '../../domain/services/safe-regex.js'
import { parseMetadata } from './_shared/parse-metadata.js'

/** A single task completion check for the `implementing → verifying` transition. */
export interface TaskCompletionCheck {
  /**
   * The artifact type ID to check (e.g. `'tasks'`).
   * Used only for error context; the actual check reads the file by `filename`.
   */
  readonly artifactId: string
  /** Filename of the artifact file within the change directory (e.g. `'tasks.md'`). */
  readonly filename: string
  /**
   * Regex pattern matched against the artifact content line-by-line.
   * Defaults to `^\s*-\s+\[ \]` (markdown unchecked checkbox) if not declared in schema.
   * If any line matches, the transition is blocked.
   */
  readonly incompletePattern: string
}

/** Input for the {@link TransitionChange} use case. */
export interface TransitionChangeInput {
  /** The change to transition. */
  readonly name: string
  /**
   * The requested target state.
   *
   * Smart routing applies at two decision points:
   * - `'implementing'` requested from `ready`: routes to `pending-spec-approval`
   *   when `approvalsSpec` is `true`.
   * - `'archivable'` requested from `done`: routes to `pending-signoff` when
   *   `approvalsSignoff` is `true`.
   *
   * All other states are transitioned directly.
   */
  readonly to: ChangeState
  /**
   * Whether the spec approval gate is enabled in the active configuration.
   *
   * When `true` and the change is in `ready` state transitioning toward
   * `implementing`, the actual target is routed to `pending-spec-approval`.
   */
  readonly approvalsSpec: boolean
  /**
   * Whether the signoff gate is enabled in the active configuration.
   *
   * When `true` and the change is in `done` state transitioning toward
   * `archivable`, the actual target is routed to `pending-signoff`.
   */
  readonly approvalsSignoff: boolean
  /**
   * Context spec paths to set when transitioning `designing → ready`.
   *
   * When omitted, the use case resolves them automatically from
   * `.specd-metadata.yaml` `dependsOn` entries of the change's `specIds`.
   * When provided, the caller's value is used as-is.
   * Ignored on all other transitions.
   */
  readonly contextSpecIds?: string[]
  /**
   * Artifact IDs whose validation is cleared when transitioning
   * `verifying → implementing`.
   *
   * Should be the `requires` list of the schema's `implementing` workflow step.
   * Ignored on all other transitions.
   */
  readonly implementingRequires?: readonly string[]
  /**
   * Task completion checks performed before allowing `implementing → verifying`.
   *
   * Each entry names an artifact file and the regex pattern for incomplete tasks.
   * If any artifact file contains a line matching its pattern, the transition
   * throws `InvalidStateTransitionError`. This is a content-level check on the
   * artifact files, not a check on `effectiveStatus`.
   *
   * Derived by the caller from the `implementing` workflow step's `requires` list
   * combined with each artifact's `taskCompletionCheck.incompletePattern` (defaulting
   * to `^\s*-\s+\[ \]` when not declared in the schema).
   *
   * Ignored on all other transitions.
   */
  readonly implementingTaskChecks?: ReadonlyArray<TaskCompletionCheck>
}

/**
 * Performs a lifecycle state transition on a change with approval-gate routing.
 *
 * Handles the two smart-routing decision points:
 * - `ready → implementing` is redirected to `ready → pending-spec-approval`
 *   when the spec approval gate is active.
 * - `done → archivable` is redirected to `done → pending-signoff` when the
 *   signoff gate is active.
 *
 * When transitioning `implementing → verifying`, checks each artifact listed
 * in `implementingTaskChecks` for incomplete task items. Throws
 * `InvalidStateTransitionError` if any incomplete item is found.
 *
 * When transitioning from `designing` to `ready`, any provided `contextSpecIds`
 * are applied to the change before the transition is recorded.
 */
export class TransitionChange {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _git: GitAdapter

  /**
   * Creates a new `TransitionChange` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param specs - Spec repositories keyed by workspace name, for resolving dependsOn metadata
   * @param git - Adapter for resolving the actor identity
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    git: GitAdapter,
  ) {
    this._changes = changes
    this._specs = specs
    this._git = git
  }

  /**
   * Executes the use case.
   *
   * @param input - Transition parameters
   * @returns The updated change after the transition
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidStateTransitionError} If the transition is not permitted or incomplete tasks remain
   */
  async execute(input: TransitionChangeInput): Promise<Change> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const actor = await this._git.identity()

    const effectiveTarget = this._resolveTarget(change.state, input)

    if (change.state === 'designing' && effectiveTarget === 'ready') {
      const contextSpecIds = input.contextSpecIds ?? (await this._resolveContextSpecIds(change))
      if (contextSpecIds.length > 0) {
        change.updateContextSpecIds(contextSpecIds)
      }
    }

    if (change.state === 'implementing' && effectiveTarget === 'verifying') {
      await this._checkTaskCompletion(change, input.implementingTaskChecks ?? [])
    }

    if (change.state === 'verifying' && effectiveTarget === 'implementing') {
      change.clearArtifactValidations(input.implementingRequires ?? [])
    }

    change.transition(effectiveTarget, actor)
    await this._changes.save(change)
    return change
  }

  /**
   * Checks each artifact file for incomplete task items before allowing
   * the `implementing → verifying` transition.
   *
   * @param change - The change whose artifact files are checked
   * @param checks - Task completion check configurations
   * @throws {InvalidStateTransitionError} If any artifact contains incomplete task items
   */
  private async _checkTaskCompletion(
    change: Change,
    checks: ReadonlyArray<TaskCompletionCheck>,
  ): Promise<void> {
    for (const check of checks) {
      const artifact = await this._changes.artifact(change, check.filename)
      if (artifact === null) continue

      const re = safeRegex(check.incompletePattern, 'm')
      if (re !== null && re.test(artifact.content)) {
        throw new InvalidStateTransitionError('implementing', 'verifying')
      }
    }
  }

  /**
   * Resolves context spec IDs by collecting `dependsOn` entries from each
   * spec's `.specd-metadata.yaml`.
   *
   * @param change - The change whose specIds are resolved
   * @returns Deduplicated list of context spec IDs from dependsOn metadata
   */
  private async _resolveContextSpecIds(change: Change): Promise<string[]> {
    const deps = new Set<string>()
    for (const specId of change.specIds) {
      const { workspace, capPath } = parseSpecId(specId)
      const repo = this._specs.get(workspace)
      if (repo === undefined) continue

      const spec = await repo.get(SpecPath.parse(capPath))
      if (spec === null) continue

      const metadataArtifact = await repo.artifact(spec, '.specd-metadata.yaml')
      if (metadataArtifact === null) continue

      try {
        const metadata = parseMetadata(metadataArtifact.content)
        if (metadata.dependsOn) {
          for (const dep of metadata.dependsOn) deps.add(dep)
        }
      } catch {
        // Skip specs with unparseable metadata
      }
    }
    return [...deps]
  }

  /**
   * Resolves the actual target state after applying approval-gate routing.
   *
   * @param currentState - The change's current lifecycle state
   * @param input - The use case input containing routing flags
   * @returns The effective target state to transition to
   */
  private _resolveTarget(currentState: ChangeState, input: TransitionChangeInput): ChangeState {
    if (currentState === 'ready' && input.to === 'implementing' && input.approvalsSpec) {
      return 'pending-spec-approval'
    }
    if (currentState === 'done' && input.to === 'archivable' && input.approvalsSignoff) {
      return 'pending-signoff'
    }
    return input.to
  }
}
