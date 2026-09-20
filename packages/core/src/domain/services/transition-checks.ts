import { InvalidInputError } from '../errors/invalid-input-error.js'
import { VALID_TRANSITIONS, type ChangeState } from '../value-objects/change-state.js'
import { type Change } from '../entities/change.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { type Schema } from '../value-objects/schema.js'

/**
 * Matcher, `classifyAlong`, and check types. Predicate `evaluate*` lives in
 * `evaluate-transition-predicates.ts` so per-check modules can import this file
 * without a cycle through `domain/checks`.
 */

/** Progress direction of a lifecycle attempt. */
export type TransitionAlong = 'forward' | 'backward' | 'redesign' | 'recovery' | 'any'

/** Predicate versus side-effecting hook. */
export type CheckKind = 'predicate' | 'effect'

/** Stable check identifiers. */
export type CheckId =
  | 'protocol.edge'
  | 'workflow.requires'
  | 'workflow.taskCompletion'
  | 'deps.consistent'
  | 'workspace.readOnly'
  | 'impl.filesResolved'
  | 'impl.linksInScope'
  | 'approval.spec'
  | 'approval.signoff'
  | 'schema.nameMatch'
  | 'archive.archivable'
  | 'spec.overlap'
  | 'hook.pre'
  | 'hook.post'

/** Outcome of a single check. */
export type CheckOutcome = 'pass' | 'fail' | 'skip'

/**
 * Canonical gerund labels for built-in checks. No `Executing:` prefix.
 */
export const CHECK_LABELS: Readonly<Record<CheckId, string>> = {
  'protocol.edge': 'Validating transition edge',
  'workflow.requires': 'Checking required artifacts',
  'workflow.taskCompletion': 'Checking task completion',
  'deps.consistent': 'Checking spec dependencies',
  'workspace.readOnly': 'Checking workspace ownership',
  'impl.filesResolved': 'Checking open implementation files',
  'impl.linksInScope': 'Checking implementation links',
  'approval.spec': 'Checking spec approval',
  'approval.signoff': 'Checking signoff approval',
  'schema.nameMatch': 'Checking schema name',
  'archive.archivable': 'Checking archivable state',
  'spec.overlap': 'Checking spec overlap',
  'hook.pre': 'Running pre hooks',
  'hook.post': 'Running post hooks',
}

/**
 * Resolves the gerund label for a built-in check id.
 *
 * @param id - Check identifier
 * @returns Canonical progress label
 */
export function checkLabel(id: CheckId): string {
  return CHECK_LABELS[id]
}

/** Result of one check on an attempt. */
export interface CheckResult {
  /** Registry identifier of the check that produced this result. */
  readonly id: CheckId
  /** Gerund progress label (same as the check’s declared `label`). */
  readonly label: string
  /** Whether the check is a predicate or a side-effecting hook. */
  readonly kind: CheckKind
  /** Pass, fail, or skip. */
  readonly outcome: CheckOutcome
  /** Machine-readable failure code when `outcome` is `fail`. */
  readonly code?: string
  /** Human-readable failure summary when `outcome` is `fail`. */
  readonly message?: string
  /** Structured extras for diagnostics (spec ids, files, artifact ids). */
  readonly details?: Readonly<Record<string, unknown>>
}

/** When a check applies. */
export type CheckApplicability =
  | {
      readonly scope: 'transition'
      readonly from: ChangeState | '*'
      readonly to: ChangeState | '*'
      readonly along: TransitionAlong | '*'
    }
  | { readonly scope: 'archive' }

/** Per-artifact checkbox counts gathered by `workflow.taskCompletion`. */
export interface TaskCompletionCounts {
  /** Tasks marked complete. */
  readonly complete: number
  /** Tasks still open. */
  readonly incomplete: number
  /** Complete plus incomplete. */
  readonly total: number
}

const AXIS_FALLBACK: readonly ChangeState[] = [
  'ready',
  'implementing',
  'verifying',
  'done',
  'archivable',
  'archiving',
]

/**
 * Maps pending/approved parking states onto the delivery step on the progress axis.
 *
 * @param state - Change state
 * @returns Axis state used for along classification
 */
function deliveryState(state: ChangeState): ChangeState {
  if (state === 'pending-spec-approval' || state === 'spec-approved') {
    return 'implementing'
  }
  if (state === 'pending-signoff' || state === 'signed-off') {
    return 'archivable'
  }
  return state
}

/**
 * Progress axis: listed known ChangeState names, with missing AXIS_FALLBACK
 * states spliced by canonical index (not tail-appended).
 *
 * @param workflowSteps - Schema workflow step names
 * @returns Ordered axis including fallback states
 */
function buildAxis(workflowSteps: readonly string[]): string[] {
  const axis = workflowSteps.filter((step) => step in VALID_TRANSITIONS)
  for (const fallback of AXIS_FALLBACK) {
    if (axis.includes(fallback)) {
      continue
    }
    const fallbackIndex = AXIS_FALLBACK.indexOf(fallback)
    let insertAt = axis.length
    for (let i = 0; i < axis.length; i++) {
      const listedIndex = AXIS_FALLBACK.indexOf(axis[i] as ChangeState)
      if (listedIndex >= 0 && listedIndex >= fallbackIndex) {
        insertAt = i
        break
      }
    }
    axis.splice(insertAt, 0, fallback)
  }
  return axis
}

/**
 * Classifies a lifecycle attempt as forward, backward, redesign, recovery, or any.
 *
 * @param from - Source change state
 * @param to - Requested target state
 * @param workflowSteps - Schema `workflow[]` step names in display/progress order
 * @returns Direction used by check matching
 */
export function classifyAlong(
  from: ChangeState,
  to: ChangeState,
  workflowSteps: readonly string[],
): TransitionAlong {
  if (from === 'archiving' && to === 'archivable') {
    return 'recovery'
  }
  if (to === 'designing' && from !== 'designing' && from !== 'drafting') {
    return 'redesign'
  }
  if (from === 'designing' && to === 'designing') {
    return 'any'
  }
  if (from !== to && deliveryState(from) === deliveryState(to)) {
    return 'forward'
  }

  const axis = buildAxis(workflowSteps)
  const fromDelivery = deliveryState(from)
  const toDelivery = deliveryState(to)
  const fromIndex =
    from === 'drafting' && !axis.includes('drafting') ? -1 : axis.indexOf(fromDelivery)
  const toIndex = axis.indexOf(toDelivery)
  if (fromIndex < 0 && from !== 'drafting') {
    return 'any'
  }
  if (toIndex < 0) {
    return 'any'
  }
  if (toIndex > fromIndex) {
    return 'forward'
  }
  if (toIndex < fromIndex) {
    return 'backward'
  }
  return 'any'
}

/** Transition or archive attempt used for matching. */
export type CheckAttempt =
  | {
      readonly scope: 'transition'
      readonly from: ChangeState
      readonly to: ChangeState
      readonly along: TransitionAlong
    }
  | { readonly scope: 'archive' }

/**
 * Whether a check applies to this attempt.
 *
 * @param applicability - Declared from/to/along or archive scope
 * @param attempt - Classified attempt
 * @returns True when the check should run
 */
export function checkMatches(applicability: CheckApplicability, attempt: CheckAttempt): boolean {
  if (applicability.scope === 'archive') {
    return attempt.scope === 'archive'
  }
  if (attempt.scope !== 'transition') {
    return false
  }
  const fromOk = applicability.from === '*' || applicability.from === attempt.from
  const toOk = applicability.to === '*' || applicability.to === attempt.to
  const alongOk =
    applicability.along === '*' ||
    applicability.along === 'any' ||
    applicability.along === attempt.along
  return fromOk && toOk && alongOk
}

/**
 * Builds a passing predicate result.
 *
 * @param id - Check identifier
 * @param kind - Predicate or effect; defaults to `predicate`
 * @param label - Gerund label; defaults to {@link CHECK_LABELS}`[id]`
 * @returns Result with `outcome` `pass`
 */
export function pass(
  id: CheckId,
  kind: CheckKind = 'predicate',
  label: string = CHECK_LABELS[id],
): CheckResult {
  return { id, label, kind, outcome: 'pass' }
}

/**
 * Builds a skipped predicate result (gate not applicable or bypassed).
 *
 * @param id - Check identifier
 * @param kind - Predicate or effect; defaults to `predicate`
 * @param label - Gerund label; defaults to {@link CHECK_LABELS}`[id]`
 * @returns Result with `outcome` `skip`
 */
export function skip(
  id: CheckId,
  kind: CheckKind = 'predicate',
  label: string = CHECK_LABELS[id],
): CheckResult {
  return { id, label, kind, outcome: 'skip' }
}

/**
 * Builds a failing predicate result.
 *
 * @param id - Check identifier
 * @param code - Machine-readable failure code
 * @param message - Human-readable failure summary
 * @param details - Optional structured diagnostics
 * @param kind - Predicate or effect; defaults to `predicate`
 * @param label - Gerund label; defaults to {@link CHECK_LABELS}`[id]`
 * @returns Result with `outcome` `fail`
 */
export function fail(
  id: CheckId,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  kind: CheckKind = 'predicate',
  label: string = CHECK_LABELS[id],
): CheckResult {
  return {
    id,
    label,
    kind,
    outcome: 'fail',
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  }
}

/**
 * Generic progress-bus events for every matching check (predicates and effects).
 * Use cases emit `check-start` / `check-done`; checks MAY emit `check-progress`
 * while running (hooks map `RunStepHooks` onto this kind).
 */
export type CheckProgressEvent =
  | { type: 'check-start'; id: CheckId; label: string }
  | {
      type: 'check-progress'
      id: CheckId
      label: string
      message?: string
      stream?: 'stdout' | 'stderr'
      line?: string
      detail?: 'hook-start' | 'hook-output' | 'hook-heartbeat' | 'hook-done'
      hookId?: string
      command?: string
      elapsedMs?: number
      success?: boolean
      exitCode?: number
    }
  | {
      type: 'check-done'
      id: CheckId
      label: string
      outcome: CheckOutcome
      reason?: string
    }

/** Sink for the generic check progress bus. */
export type OnCheckProgress = (event: CheckProgressEvent) => void

/**
 * Host context for {@link Check.execute}. Check-specific facts (task counts, extracts)
 * MUST NOT appear here — each check gathers those through constructor ports.
 */
export interface CheckExecutionContext {
  /** Change under evaluation. */
  readonly change: Change
  /** Active schema. */
  readonly schema: Schema
  /** Transition triple or archive operation. */
  readonly attempt: CheckAttempt
  /** `--skip-hooks` selectors; effects only. */
  readonly skipHookPhases?: readonly string[]
  /** Archive/status overlap skip flag. */
  readonly allowOverlap: boolean
  /** Out-of-scope implementation-link skip flag. */
  readonly allowOutOfScope: boolean
  /** Config approval gates. */
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  /** Effective artifact statuses for `workflow.requires`. */
  readonly effectiveStatusByArtifact: ReadonlyMap<string, ArtifactStatus>
  /** Optional sink for `check-progress` while a check’s `execute` runs. */
  readonly onCheckProgress?: OnCheckProgress
  /**
   * Ephemeral memo for the current evaluation pass (`executeChecksByLegalTargets`
   * or one `TransitionChange` predicate pass). MUST NOT be reused across executes.
   */
  readonly passMemo?: Map<string, unknown>
}

/**
 * Applicability and pipeline policy without a check instance.
 * {@link createWorkflowCheckRegistry} materializes these rows with `create*` checks.
 */
export interface CheckBindingSpec {
  /** Stable check id. */
  readonly id: CheckId
  /** When this check applies (transition triple or operation `archive`). */
  readonly applicability: readonly CheckApplicability[]
  /** When unmatched, emit `skip` instead of omitting the row. */
  readonly reportSkipWhenUnmatched?: boolean
  /** Classified `along` values that must not attach this check. */
  readonly exceptAlong?: readonly TransitionAlong[]
  /** Effect slot. Predicates omit this. */
  readonly phase?: EffectPipelinePhase
  /** Effect failure policy. Predicates omit this. */
  readonly onFailure?: EffectOnFailure
}

/**
 * A reusable check. Routing lives on {@link CheckBinding}, not on the check.
 */
export interface Check {
  /** Stable check id. */
  readonly id: CheckId
  /**
   * Mandatory gerund progress label (no `Executing:` prefix).
   * Built-ins use {@link CHECK_LABELS}.
   */
  readonly label: string
  /**
   * Predicate vs `run:` hook. Required on every check — do not infer from `id`.
   */
  readonly kind: CheckKind
  /**
   * Self-sufficient evaluation. Ports live on the instance (`create*`), not on `ctx`.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}

/**
 * Whether a check is a `run:` effect rather than a blocking predicate.
 *
 * @param check - Registered check
 * @returns True when `kind` is `effect`
 */
export function isEffectCheck(check: Check): boolean {
  return check.kind === 'effect'
}

/** Use-case slot for an effect binding. */
export type EffectPipelinePhase = 'before-persist' | 'after-persist'

/** Failure policy for an effect binding. */
export type EffectOnFailure = 'abort' | 'collect'

/**
 * Registry wiring: which check runs for which attempt.
 */
export interface CheckBinding {
  /** Predicate or effect to invoke when a row matches. */
  readonly check: Check
  /** When this check applies (transition triple or operation `archive`). */
  readonly applicability: readonly CheckApplicability[]
  /** When unmatched, emit `skip` instead of omitting the row. */
  readonly reportSkipWhenUnmatched?: boolean
  /** Classified `along` values that must not attach this check. */
  readonly exceptAlong?: readonly TransitionAlong[]
  /** Effect slot. Predicates omit this. */
  readonly phase?: EffectPipelinePhase
  /** Effect failure policy. Predicates omit this. */
  readonly onFailure?: EffectOnFailure
}

/**
 * Attaches check instances to applicability specs. Specs are the single binding table.
 *
 * @param specs - Domain applicability rows
 * @param checks - Check instances keyed by id
 * @returns Bindings in spec order
 */
export function applyBindingSpecs(
  specs: readonly CheckBindingSpec[],
  checks: Readonly<Partial<Record<CheckId, Check>>>,
): readonly CheckBinding[] {
  return specs.map((spec) => {
    const check = checks[spec.id]
    if (check === undefined) {
      throw new InvalidInputError(`No check instance for binding '${spec.id}'`)
    }
    return {
      check,
      applicability: spec.applicability,
      ...(spec.reportSkipWhenUnmatched === true ? { reportSkipWhenUnmatched: true } : {}),
      ...(spec.exceptAlong !== undefined ? { exceptAlong: spec.exceptAlong } : {}),
      ...(spec.phase !== undefined ? { phase: spec.phase } : {}),
      ...(spec.onFailure !== undefined ? { onFailure: spec.onFailure } : {}),
    }
  })
}
