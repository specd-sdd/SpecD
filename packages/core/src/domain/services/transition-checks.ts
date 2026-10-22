import { InvalidInputError } from '../errors/invalid-input-error.js'
import { type ChangeState } from '../value-objects/change-state.js'
import { type Change } from '../entities/change.js'
import { type ChangeValidityVerdict } from './change-validity.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { type Schema } from '../value-objects/schema.js'
import { deepMergeConfig } from './deep-merge-config.js'
import { type CheckGovernance, type CheckRegistry } from './check-registry.js'
import { resolveWorkflowPipeline, type ApprovalGates } from './workflow-topology.js'

/**
 * Matcher, `classifyAlong`, and check types. Predicate `evaluate*` lives in
 * `evaluate-transition-predicates.ts` so per-check modules can import this file
 * without a cycle through `domain/checks`.
 */

/** Progress direction of a lifecycle attempt. */
export type TransitionAlong = 'forward' | 'backward' | 'redesign' | 'recovery' | 'any'

/** Predicate versus side-effecting hook. */
export type CheckKind = 'predicate' | 'effect'

/** Stable check identifiers. Open string supporting custom namespaced checks. */
export type CheckId = string

/** Built-in check identifier union. */
export type BuiltinCheckId =
  | 'protocol.edge'
  | 'workflow.requires'
  | 'workflow.taskCompletion'
  | 'workflow.tasksEmpty'
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
  | 'verification.current'

/** Outcome of a single check. */
export type CheckOutcome = 'pass' | 'fail' | 'skip'

/**
 * Canonical gerund labels for built-in checks. No `Executing:` prefix.
 */
export const CHECK_LABELS: Readonly<Record<BuiltinCheckId, string>> = {
  'protocol.edge': 'Validating transition edge',
  'workflow.requires': 'Checking required artifacts',
  'workflow.taskCompletion': 'Checking task completion',
  'workflow.tasksEmpty': 'Checking empty tasks',
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
  'verification.current': 'Checking verification freshness',
}

/**
 * Resolves the gerund label for a check id (built-in or fallback).
 *
 * @param id - Check identifier
 * @returns Canonical progress label
 */
export function checkLabel(id: string): string {
  return CHECK_LABELS[id as BuiltinCheckId] ?? id
}

/** Result of one check on an attempt. */
export interface CheckResult {
  /** Registry identifier of the check that produced this result. */
  readonly id: string
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
  /** Suggested CLI remediation command on failure. */
  readonly command?: string
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
  | { readonly scope: 'operation'; readonly operation: 'verification-start' }
  | {
      readonly scope: 'step-skip'
      readonly step: ChangeState | '*'
    }

/** Per-artifact checkbox counts gathered by `workflow.taskCompletion`. */
export interface TaskCompletionCounts {
  /** Tasks marked complete. */
  readonly complete: number
  /** Tasks still open. */
  readonly incomplete: number
  /** Complete plus incomplete. */
  readonly total: number
}

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
 * Classifies a lifecycle attempt as forward, backward, redesign, recovery, or any.
 *
 * @param from - Source change state
 * @param to - Requested target state
 * @param schema - Sovereign change schema
 * @param approvals - Exact approval-gate snapshot for this evaluation
 * @returns Direction used by check matching
 */
export function classifyAlong(
  from: ChangeState,
  to: ChangeState,
  schema: Schema,
  approvals: ApprovalGates,
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

  const axis = resolveWorkflowPipeline(schema, approvals).map((entry) => entry.step)
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

/** Transition, archive, or step-skip attempt used for matching. */
export type CheckAttempt =
  | {
      readonly scope: 'transition'
      readonly from: ChangeState
      readonly to: ChangeState
      readonly along: TransitionAlong
    }
  | { readonly scope: 'archive' }
  | { readonly scope: 'operation'; readonly operation: 'verification-start' }
  | {
      readonly scope: 'step-skip'
      readonly step: ChangeState
      readonly from: ChangeState
      readonly to: ChangeState
    }

/**
 * Whether a check applies to this attempt.
 *
 * @param applicability - Declared from/to/along, archive, or step-skip scope
 * @param attempt - Classified attempt
 * @returns True when the check should run
 */
export function checkMatches(applicability: CheckApplicability, attempt: CheckAttempt): boolean {
  if (applicability.scope === 'archive') {
    return attempt.scope === 'archive'
  }
  if (applicability.scope === 'operation') {
    return attempt.scope === 'operation' && applicability.operation === attempt.operation
  }
  if (applicability.scope === 'step-skip') {
    return (
      attempt.scope === 'step-skip' &&
      (applicability.step === '*' || applicability.step === attempt.step)
    )
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
  id: string,
  kind: CheckKind = 'predicate',
  label: string = CHECK_LABELS[id as BuiltinCheckId] ?? id,
): CheckResult {
  return { id, label, kind, outcome: 'pass' }
}

/**
 * Builds a skipped predicate result (gate not applicable or bypassed).
 *
 * @param id - Check identifier
 * @param kind - Predicate or effect; defaults to `predicate`
 * @param label - Gerund label; defaults to {@link CHECK_LABELS}`[id]`
 * @param message - Optional skip message
 * @param details - Optional details
 * @returns Result with `outcome` `skip`
 */
export function skip(
  id: string,
  kind: CheckKind = 'predicate',
  label: string = CHECK_LABELS[id as BuiltinCheckId] ?? id,
  message?: string,
  details?: Readonly<Record<string, unknown>>,
): CheckResult {
  return {
    id,
    label,
    kind,
    outcome: 'skip',
    ...(message !== undefined ? { message } : {}),
    ...(details !== undefined ? { details } : {}),
  }
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
 * @param command - Optional CLI remediation command
 * @returns Result with `outcome` `fail`
 */
export function fail(
  id: string,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  kind: CheckKind = 'predicate',
  label: string = CHECK_LABELS[id as BuiltinCheckId] ?? id,
  command?: string,
): CheckResult {
  return {
    id,
    label,
    kind,
    outcome: 'fail',
    code,
    message,
    ...(command !== undefined ? { command } : {}),
    ...(details !== undefined ? { details } : {}),
  }
}

/**
 * Generic progress-bus events for every matching check (predicates and effects).
 * Use cases emit `check-start` / `check-done`; checks MAY emit `check-progress`
 * while running (hooks map `RunStepHooks` onto this kind).
 */
export type CheckProgressEvent =
  | { type: 'check-start'; id: string; label: string }
  | {
      type: 'check-progress'
      id: string
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
      id: string
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
  /** Effective cascading check configuration. */
  readonly config?: Readonly<Record<string, unknown>>
  /**
   * Reconciled validity snapshot for this evaluation.
   *
   * Checks read it and must not mutate projections or read files to recompute it.
   */
  readonly validity?: ChangeValidityVerdict
  /** Optional sink for `check-progress` while a check’s `execute` runs. */
  readonly onCheckProgress?: OnCheckProgress
  /** `--skip-hooks` selectors; effects only. */
  readonly skipHookPhases?: readonly string[]
  /** Effective artifact statuses for `workflow.requires`. */
  readonly effectiveStatusByArtifact?: ReadonlyMap<string, ArtifactStatus>
  /** Config approval gates. */
  readonly approvals?: { readonly spec: boolean; readonly signoff: boolean }
  /**
   * Ephemeral memo for the current evaluation pass (`executeChecksByLegalTargets`
   * or one `TransitionChange` predicate pass). MUST NOT be reused across executes.
   */
  readonly passMemo?: Map<string, unknown>
}

/**
 * Public authoring contract for custom checks implemented by external plugins.
 * Engine internals (`kind`) and lifecycle routing policies (`skippable`) are omitted.
 */
export interface CustomCheckDefinition {
  /** Local check identifier (e.g. 'code-scan'); namespaced by registry to '@plugin.code-scan'. */
  readonly id: string
  /** Canonical gerund label for diagnostics and UI logs. */
  readonly label: string
  /** Default CLI remediation command suggested on failure. */
  readonly command?: string
  /** Pure evaluation function. */
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}

/**
 * Applicability and pipeline policy without a check instance.
 * {@link createWorkflowCheckRegistry} materializes these rows with `create*` checks.
 */
export interface CheckBindingSpec {
  /** Stable check id. */
  readonly id: string
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
  /** Whether the orchestrator allows bypassing this check via `--skip-checks`. */
  readonly skippable?: boolean
  /** Whether schema.yaml is allowed to override onFailure or skippable on this binding. */
  readonly allowBindingOverride?: boolean
  /** Whether schema.yaml is allowed to override configuration for this binding. */
  readonly allowConfigOverride?: boolean
  /** Whether schema.yaml is allowed to disable this check on this binding. */
  readonly allowDisable?: boolean
  /** Default binding-level configuration. */
  readonly config?: Readonly<Record<string, unknown>>
}

/**
 * A reusable check. Routing lives on {@link CheckBinding}, not on the check.
 */
export interface Check {
  /** Stable check id. */
  readonly id: string
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
   * Suggested CLI remediation command on failure.
   */
  readonly command?: string
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
  /** Whether the orchestrator allows bypassing this check via `--skip-checks`. */
  readonly skippable: boolean
  /** Whether schema.yaml is allowed to override onFailure or skippable on this binding. */
  readonly allowBindingOverride: boolean
  /** Whether schema.yaml is allowed to override configuration for this binding. */
  readonly allowConfigOverride: boolean
  /** Whether schema.yaml is allowed to disable this check on this binding. */
  readonly allowDisable?: boolean
  /** Default binding-level configuration. */
  readonly config?: Readonly<Record<string, unknown>>
  /**
   * Fully cascaded config (check default, binding config, step config) computed once
   * by {@link resolveEffectiveBindings}. Consumers use it unchanged.
   */
  readonly effectiveConfig?: Readonly<Record<string, unknown>>
}

/**
 * Attaches check instances to applicability specs. Specs are the single binding table.
 *
 * @param specs - Domain applicability rows
 * @param checks - Check instances keyed by id
 * @param governanceOf - Optional check-level governance lookup inherited when a spec omits a lock
 * @returns Bindings in spec order
 */
export function applyBindingSpecs(
  specs: readonly CheckBindingSpec[],
  checks: Readonly<Partial<Record<string, Check>>>,
  governanceOf?: (checkId: string) => CheckGovernance | undefined,
): readonly CheckBinding[] {
  return specs.map((spec) => {
    const check = checks[spec.id]
    if (check === undefined) {
      throw new InvalidInputError(`No check instance for binding '${spec.id}'`)
    }
    return {
      check,
      applicability: spec.applicability,
      skippable: spec.skippable ?? false,
      allowBindingOverride:
        spec.allowBindingOverride ?? governanceOf?.(spec.id)?.allowBindingOverride ?? false,
      allowConfigOverride:
        spec.allowConfigOverride ?? governanceOf?.(spec.id)?.allowConfigOverride ?? false,
      allowDisable: spec.allowDisable ?? governanceOf?.(spec.id)?.allowDisable ?? false,
      ...(spec.config !== undefined ? { config: spec.config } : {}),
      ...(spec.reportSkipWhenUnmatched === true ? { reportSkipWhenUnmatched: true } : {}),
      ...(spec.exceptAlong !== undefined ? { exceptAlong: spec.exceptAlong } : {}),
      ...(spec.phase !== undefined ? { phase: spec.phase } : {}),
      ...(spec.onFailure !== undefined ? { onFailure: spec.onFailure } : {}),
    }
  })
}

/**
 * Input for dynamic runtime binding composition.
 */
export interface ResolveEffectiveBindingsInput {
  /** Baseline bindings (built-ins and kernel plugins). */
  readonly baseBindings: readonly CheckBinding[]
  /** Change sovereign schema. */
  readonly schema: Schema
  /** Optional target step for a candidate transition (scope: 'transition'). */
  readonly targetStep?: ChangeState | undefined
  /** Optional intermediate steps bypassed by shortcut transition (scope: 'step-skip'). */
  readonly bypassedSteps?: readonly ChangeState[] | undefined
  /** Source state of the attempt. Required with `targetStep`. */
  readonly from?: ChangeState | undefined
  /** Transition direction along the active pipeline. Required with `targetStep`. */
  readonly along?: TransitionAlong | undefined
  /** Optional check registry for catalog lookups and governance default configs. */
  readonly registry?: CheckRegistry | undefined
  /**
   * Selects the archive operation (`scope: 'archive'`): the `archiveChecks` of the
   * `archiving` step are overlaid on the base archive bindings. Mutually exclusive with
   * `targetStep` and `bypassedSteps`.
   */
  readonly operation?: 'archive' | undefined
}

/**
 * Copies a binding without any previously cascaded `effectiveConfig`.
 *
 * @param binding - Binding to copy
 * @returns A copy whose effective config can be recomputed
 */
function withoutEffectiveConfig(binding: CheckBinding): CheckBinding {
  const copy: { -readonly [K in keyof CheckBinding]: CheckBinding[K] } = { ...binding }
  delete copy.effectiveConfig
  return copy
}

/** Minimal shape shared by `checks`, `skipChecks`, and `archiveChecks` declarations. */
interface OverlayDeclaration {
  readonly id: string
  readonly disabled?: boolean | undefined
  readonly skippable?: boolean | undefined
  readonly onFailure?: EffectOnFailure | undefined
  readonly config?: Readonly<Record<string, unknown>> | undefined
}

/** One overlay pass: which declarations apply, to which rows, at which concrete coordinate. */
interface OverlayPlan<D extends OverlayDeclaration> {
  /** Declarations to apply. */
  readonly declarations: readonly D[]
  /** Whether a declaration applies to this attempt; defaults to always. */
  readonly declMatches?: (decl: D) => boolean
  /** Rows of a base binding that this plan overlays. */
  readonly rowsOf: (binding: CheckBinding) => readonly CheckApplicability[]
  /** Concrete applicability carried by overlaid clones and synthesized bindings. */
  readonly concrete: CheckApplicability
  /** Bypassed step this plan is concrete for (step-skip plans only). */
  readonly step?: ChangeState
}

/** One schema overlay applied to a base binding at a single coordinate. */
interface BindingEdit {
  /** Applicability rows of the base binding replaced by this overlay. */
  readonly rows: readonly CheckApplicability[]
  /** Concrete applicability carried by the clone this overlay produces. */
  readonly applicability: readonly CheckApplicability[]
  /** Bypassed step this overlay is concrete for (step-skip overlays only). */
  readonly step?: ChangeState
  /** Schema declaration that produced the edit. */
  readonly decl: {
    readonly disabled?: boolean | undefined
    readonly skippable?: boolean | undefined
    readonly onFailure?: EffectOnFailure | undefined
    readonly config?: Readonly<Record<string, unknown>> | undefined
  }
}

/**
 * Pure domain function that resolves effective check bindings by overlaying
 * schema-declared checks (`checks:`, `skipChecks:`, and `archiveChecks:`) onto base bindings,
 * synthesizing bindings for declarations no base row serves, and cascading
 * configuration via `deepMergeConfig`.
 *
 * This is the only place step declarations are applied: the result is the complete,
 * concrete set of bindings for one attempt, executed unchanged by the predicate runner.
 * Each declaration applies only to the attempt it matches (`from`/`to`/`along`); the
 * base rows it overlays are replaced by one clone whose applicability is the concrete
 * attempt (transition), the concrete bypassed step (step-skip), or the archive coordinate
 * (`operation: 'archive'`). A base binding that serves several coordinates keeps its
 * non-overlaid rows in a remainder copy.
 *
 * @param input - Dynamic binding resolution inputs
 * @returns Fully composed effective check bindings
 * @throws {@link InvalidInputError} When `targetStep` is given without `from` and `along`, or when
 *   `operation: 'archive'` is combined with `targetStep` or `bypassedSteps`
 */
export function resolveEffectiveBindings(
  input: ResolveEffectiveBindingsInput,
): readonly CheckBinding[] {
  const {
    baseBindings,
    schema,
    targetStep,
    bypassedSteps = [],
    from,
    along,
    registry,
    operation,
  } = input

  if (operation === 'archive' && (targetStep !== undefined || bypassedSteps.length > 0)) {
    throw new InvalidInputError(
      "resolveEffectiveBindings: 'operation: archive' cannot be combined with 'targetStep' or 'bypassedSteps'",
    )
  }

  const editsByIndex = new Map<number, BindingEdit[]>()
  const synthesizedBindings: CheckBinding[] = []

  // Single-pass config cascade: check default -> binding config -> step config.
  const cascadeConfig = (
    checkId: string,
    bindingConfig?: Readonly<Record<string, unknown>>,
    stepConfig?: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> | undefined => {
    const gov = registry?.getGovernance(checkId)
    const merged = deepMergeConfig(deepMergeConfig(gov?.defaultConfig, bindingConfig), stepConfig)
    return Object.keys(merged).length > 0 ? merged : undefined
  }

  const recordEdit = (index: number, edit: BindingEdit): void => {
    const list = editsByIndex.get(index) ?? []
    list.push(edit)
    editsByIndex.set(index, list)
  }

  // Shared overlay: applies one plan's declarations to the base rows it serves, or
  // synthesizes a binding for a registered check no base row serves.
  const overlay = <D extends OverlayDeclaration>(plan: OverlayPlan<D>): void => {
    for (const chk of plan.declarations) {
      // A declaration for another coordinate leaves base bindings untouched.
      if (plan.declMatches !== undefined && !plan.declMatches(chk)) continue

      let matchedAny = false

      for (let i = 0; i < baseBindings.length; i++) {
        const b = baseBindings[i]!
        if (b.check.id !== chk.id) continue

        const rows = plan.rowsOf(b)
        if (rows.length > 0) {
          matchedAny = true
          recordEdit(i, {
            rows,
            applicability: [plan.concrete],
            ...(plan.step !== undefined ? { step: plan.step } : {}),
            decl: chk,
          })
        }
      }

      if (!matchedAny && chk.disabled !== true && registry) {
        const check = registry.get(chk.id)
        if (check) {
          const governance = registry.getGovernance(chk.id)
          const effectiveConfig = cascadeConfig(chk.id, undefined, chk.config)
          const onFailure = chk.onFailure ?? 'abort'
          synthesizedBindings.push({
            check,
            applicability: [plan.concrete],
            skippable: chk.skippable ?? false,
            allowBindingOverride: governance?.allowBindingOverride ?? false,
            allowConfigOverride: governance?.allowConfigOverride ?? false,
            allowDisable: governance?.allowDisable ?? false,
            onFailure,
            ...(effectiveConfig !== undefined ? { effectiveConfig } : {}),
          })
        }
      }
    }
  }

  // 1. Overlay targetStep checks (scope: 'transition')
  if (targetStep !== undefined) {
    if (from === undefined || along === undefined) {
      throw new InvalidInputError(
        'resolveEffectiveBindings requires `from` and `along` when `targetStep` is given',
      )
    }
    const attempt: CheckAttempt = { scope: 'transition', from, to: targetStep, along }
    overlay({
      declarations: schema.workflowStep(targetStep)?.checks ?? [],
      declMatches: (chk) =>
        checkMatches(
          {
            scope: 'transition',
            from: chk.from ?? '*',
            to: targetStep,
            along: chk.along ?? 'forward',
          },
          attempt,
        ),
      rowsOf: (b) =>
        b.applicability.filter((a) => a.scope === 'transition' && checkMatches(a, attempt)),
      concrete: { scope: 'transition', from, to: targetStep, along },
    })
  }

  // 2. Overlay bypassedSteps checks (scope: 'step-skip'), one concrete clone per declared step
  for (const bypassedStep of bypassedSteps) {
    overlay({
      declarations: schema.workflowStep(bypassedStep)?.skipChecks ?? [],
      rowsOf: (b) =>
        b.applicability.filter(
          (a) => a.scope === 'step-skip' && (a.step === '*' || a.step === bypassedStep),
        ),
      concrete: { scope: 'step-skip', step: bypassedStep },
      step: bypassedStep,
    })
  }

  // 2b. Overlay archiveChecks of the `archiving` step (scope: 'archive')
  if (operation === 'archive') {
    overlay({
      declarations: schema.workflowStep('archiving')?.archiveChecks ?? [],
      rowsOf: (b) => b.applicability.filter((a) => a.scope === 'archive'),
      concrete: { scope: 'archive' },
    })
  }

  // 3. Assemble combined result, splitting bindings that were edited per coordinate
  const result: CheckBinding[] = []
  for (let i = 0; i < baseBindings.length; i++) {
    const b = baseBindings[i]!
    const edits = editsByIndex.get(i)
    if (edits === undefined) {
      const effectiveConfig = cascadeConfig(b.check.id, b.config)
      result.push(effectiveConfig !== undefined ? { ...b, effectiveConfig } : b)
      continue
    }

    const claimed = new Set<CheckApplicability>()
    for (const edit of edits) {
      for (const row of edit.rows) claimed.add(row)
      if (edit.decl.disabled === true) continue
      const effectiveConfig = cascadeConfig(b.check.id, b.config, edit.decl.config)
      const onFailure = edit.decl.onFailure ?? b.onFailure
      result.push({
        ...withoutEffectiveConfig(b),
        applicability: edit.applicability,
        skippable: edit.decl.skippable !== undefined ? edit.decl.skippable : b.skippable,
        ...(onFailure !== undefined ? { onFailure } : {}),
        ...(effectiveConfig !== undefined ? { effectiveConfig } : {}),
      })
    }

    const residual: CheckApplicability[] = b.applicability.filter((row) => !claimed.has(row))
    // A claimed wildcard step-skip row also served the bypassed steps no declaration
    // named: keep those as concrete rows with the base policy.
    if (
      claimed.size > 0 &&
      b.applicability.some(
        (row) => claimed.has(row) && row.scope === 'step-skip' && row.step === '*',
      )
    ) {
      const declaredSteps = new Set(
        edits.flatMap((edit) => (edit.step !== undefined ? [edit.step] : [])),
      )
      for (const bypassed of bypassedSteps) {
        if (!declaredSteps.has(bypassed)) residual.push({ scope: 'step-skip', step: bypassed })
      }
    }
    if (residual.length > 0) {
      const effectiveConfig = cascadeConfig(b.check.id, b.config)
      result.push({
        ...b,
        applicability: residual,
        ...(effectiveConfig !== undefined ? { effectiveConfig } : {}),
      })
    }
  }

  result.push(...synthesizedBindings)
  return result
}
