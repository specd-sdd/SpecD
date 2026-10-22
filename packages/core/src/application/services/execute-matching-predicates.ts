import { bindingMatches } from '../../domain/services/evaluate-transition-predicates.js'
import {
  classifyAlong,
  isEffectCheck,
  skip,
  type Check,
  type CheckAttempt,
  type CheckBinding,
  type CheckExecutionContext,
  type CheckId,
  type CheckResult,
  type OnCheckProgress,
  type TransitionAlong,
} from '../../domain/services/transition-checks.js'
import { deepMergeConfig } from '../../domain/services/deep-merge-config.js'
import { type CheckRegistry } from '../../domain/services/check-registry.js'
import {
  listWorkflowTransitions,
  type ApprovalGates,
} from '../../domain/services/workflow-topology.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { type Change } from '../../domain/entities/change.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { evaluateTransitionCandidate } from './evaluate-transition-candidate.js'

/** Result of running matching predicates for one attempt. */
export interface PredicateExecutionResult {
  /** True when no predicate returned `fail`. */
  readonly allowed: boolean
  /** Ordered predicate results. */
  readonly checks: readonly CheckResult[]
  /** Classified along (transitions only). */
  readonly along?: TransitionAlong
}

/**
 * Host context fields shared across predicate/effect execute calls.
 */
export interface BuildCheckExecutionContextInput {
  readonly change: Change
  readonly schema: Schema
  readonly attempt: CheckAttempt
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  readonly skipChecks?: readonly string[]
  readonly skipHookPhases?: readonly string[]
  readonly effectiveStatusByArtifact?: ReadonlyMap<string, ArtifactStatus>
  readonly onCheckProgress?: OnCheckProgress
  readonly passMemo?: Map<string, unknown>
  readonly validity?: import('../../domain/services/change-validity.js').ChangeValidityVerdict
  readonly checkRegistry?: CheckRegistry
  readonly config?: Readonly<Record<string, unknown>>
}

/**
 * Builds a {@link CheckExecutionContext} from host fields.
 *
 * @param input - Host attempt fields
 * @returns Context for `check.execute`
 */
export function buildCheckExecutionContext(
  input: BuildCheckExecutionContextInput,
): CheckExecutionContext & {
  readonly skipChecks?: readonly string[]
  readonly checkRegistry?: CheckRegistry
} {
  return {
    change: input.change,
    schema: input.schema,
    attempt: input.attempt,
    approvals: input.approvals,
    effectiveStatusByArtifact: input.effectiveStatusByArtifact ?? new Map(),
    ...(input.skipChecks !== undefined ? { skipChecks: input.skipChecks } : {}),
    ...(input.skipHookPhases !== undefined ? { skipHookPhases: input.skipHookPhases } : {}),
    ...(input.onCheckProgress !== undefined ? { onCheckProgress: input.onCheckProgress } : {}),
    ...(input.passMemo !== undefined ? { passMemo: input.passMemo } : {}),
    ...(input.validity !== undefined ? { validity: input.validity } : {}),
    ...(input.checkRegistry !== undefined ? { checkRegistry: input.checkRegistry } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  }
}

/**
 * Emits `check-start`, runs `execute`, then emits `check-done` (including `skip`).
 *
 * @param check - Matching check to run
 * @param ctx - Host attempt context (optional `onCheckProgress` sink)
 * @returns Check result from `execute`
 */
export async function executeCheckWithProgress(
  check: Check,
  ctx: CheckExecutionContext,
): Promise<CheckResult> {
  const { id, label } = check
  ctx.onCheckProgress?.({ type: 'check-start', id, label })
  try {
    const result = await check.execute(ctx)
    ctx.onCheckProgress?.({
      type: 'check-done',
      id: result.id,
      label: result.label,
      outcome: result.outcome,
      ...(result.outcome === 'fail' && result.message !== undefined
        ? { reason: result.message }
        : {}),
    })
    return result
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    ctx.onCheckProgress?.({
      type: 'check-done',
      id,
      label,
      outcome: 'fail',
      reason,
    })
    throw error
  }
}

/**
 * Predicate rows from a binding table (effects excluded).
 *
 * @param bindings - Transition or archive binding table
 * @returns Predicate rows in registry order
 */
export function matchingPredicates(bindings: readonly CheckBinding[]): readonly CheckBinding[] {
  return bindings.filter((binding) => !isEffectCheck(binding.check))
}

/**
 * Runs matching predicates via `check.execute(ctx)` in binding order,
 * with cascading configuration resolution and orchestrator bypass handling.
 *
 * @param bindings - Full binding table
 * @param ctx - Host attempt context
 * @param options - Evaluation options
 * @param options.failFast - Stop after any fail
 * @param options.failFastOn - Stop only when this check id fails
 * @param options.skipChecks - Optional array of check IDs to bypass
 * @param options.checkRegistry - Optional CheckRegistry for config resolution
 * @returns Allowed flag and ordered results
 */
export async function executeMatchingPredicates(
  bindings: readonly CheckBinding[],
  ctx: CheckExecutionContext & {
    readonly skipChecks?: readonly string[]
    readonly checkRegistry?: CheckRegistry
  },
  options: {
    readonly failFast?: boolean
    readonly failFastOn?: CheckId
    readonly skipChecks?: readonly string[]
    readonly checkRegistry?: CheckRegistry
  } = {},
): Promise<PredicateExecutionResult> {
  const along = ctx.attempt.scope === 'transition' ? ctx.attempt.along : undefined
  const checks: CheckResult[] = []
  const seen = new Set<string>()
  const skipChecksSet = new Set<string>(options.skipChecks ?? ctx.skipChecks ?? [])
  const registry = options.checkRegistry ?? ctx.checkRegistry

  for (const binding of matchingPredicates(bindings)) {
    const matches = bindingMatches(binding, ctx.attempt, along)
    if (matches) {
      if (seen.has(binding.check.id)) continue
      seen.add(binding.check.id)

      if (skipChecksSet.has(binding.check.id)) {
        ctx.onCheckProgress?.({
          type: 'check-done',
          id: binding.check.id,
          label: binding.check.label,
          outcome: 'skip',
        })
        checks.push({
          id: binding.check.id,
          label: binding.check.label,
          kind: binding.check.kind,
          outcome: 'skip',
          details: { bypassedByUser: true },
        })
        continue
      }

      // Resolved bindings carry the single-pass cascade; unresolved ones (e.g. archive)
      // merge check default and binding config once. Step config is never merged here.
      const effectiveConfig =
        binding.effectiveConfig ??
        deepMergeConfig(registry?.getGovernance(binding.check.id)?.defaultConfig, binding.config)

      const checkCtx: CheckExecutionContext = {
        ...ctx,
        config: effectiveConfig,
      }

      const result = await executeCheckWithProgress(binding.check, checkCtx)
      checks.push(result)
      if (
        result.outcome === 'fail' &&
        (options.failFast === true || options.failFastOn === result.id)
      ) {
        break
      }
      continue
    }
    if (binding.reportSkipWhenUnmatched === true) {
      checks.push(skip(binding.check.id, binding.check.kind, binding.check.label))
    }
  }

  return {
    allowed: checks.every((check) => check.outcome !== 'fail'),
    checks,
    ...(along !== undefined ? { along } : {}),
  }
}

/**
 * Builds a transition attempt and classified `along` for a hop.
 *
 * @param from - Current state
 * @param to - Requested target
 * @param schema - Active schema
 * @param approvals - Exact approval-gate snapshot used by topology
 * @returns Attempt + along
 */
export function transitionAttemptFor(
  from: ChangeState,
  to: ChangeState,
  schema: Schema,
  approvals: ApprovalGates,
): {
  readonly attempt: Extract<CheckAttempt, { scope: 'transition' }>
  readonly along: TransitionAlong
} {
  const along = classifyAlong(from, to, schema, approvals)
  return {
    along,
    attempt: { scope: 'transition', from, to, along },
  }
}

/** Check results and resolved bindings for every protocol-legal target. */
export interface LegalTargetEvaluations {
  /** Predicate results keyed by target. */
  readonly checksByTarget: Partial<Record<ChangeState, readonly CheckResult[]>>
  /** Resolved (schema-composed) bindings keyed by target; the source of derived policy. */
  readonly bindingsByTarget: Partial<Record<ChangeState, readonly CheckBinding[]>>
}

/**
 * Evaluates the candidate for every protocol-legal target from the current state.
 *
 * @param bindings - Transition binding table
 * @param input - Host fields shared across targets
 * @param input.change - Change being evaluated
 * @param input.schema - Active schema
 * @param input.approvals - Approval gate flags
 * @param input.approvals.spec - Spec-approval gate
 * @param input.approvals.signoff - Signoff gate
 * @param input.effectiveStatusByArtifact - DAG effective statuses
 * @param input.passMemo - Shared memo for this GetStatus/TransitionChange pass
 * @param input.validity - Reconciled validity verdict for this pass
 * @param input.checkRegistry - Optional CheckRegistry
 * @param input.skipChecks - Optional list of check IDs to bypass
 * @returns Predicate results and resolved bindings keyed by target
 */
export async function evaluateLegalTargets(
  bindings: readonly CheckBinding[],
  input: {
    readonly change: Change
    readonly schema: Schema
    readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
    readonly effectiveStatusByArtifact: ReadonlyMap<string, ArtifactStatus>
    readonly passMemo?: Map<string, unknown>
    readonly validity?: import('../../domain/services/change-validity.js').ChangeValidityVerdict
    readonly checkRegistry?: CheckRegistry
    readonly skipChecks?: readonly string[]
  },
): Promise<LegalTargetEvaluations> {
  const passMemo = input.passMemo ?? new Map<string, unknown>()
  const checksByTarget: Partial<Record<ChangeState, readonly CheckResult[]>> = {}
  const bindingsByTarget: Partial<Record<ChangeState, readonly CheckBinding[]>> = {}
  const targets = listWorkflowTransitions(input.change.state, input.schema, input.approvals)
  for (const target of targets) {
    const candidate = await evaluateTransitionCandidate({
      change: input.change,
      schema: input.schema,
      approvals: input.approvals,
      target,
      mode: 'projection',
      baseBindings: bindings,
      passMemo,
      effectiveStatusByArtifact: input.effectiveStatusByArtifact,
      ...(input.validity !== undefined ? { validity: input.validity } : {}),
      ...(input.checkRegistry !== undefined ? { checkRegistry: input.checkRegistry } : {}),
      ...(input.skipChecks !== undefined ? { skipChecks: input.skipChecks } : {}),
    })
    checksByTarget[target] = candidate.checks
    bindingsByTarget[target] = candidate.bindings
  }
  return { checksByTarget, bindingsByTarget }
}

/**
 * Executes matching predicates for every protocol-legal target from the current state.
 *
 * @param bindings - Transition binding table
 * @param input - Same host fields as {@link evaluateLegalTargets}
 * @returns Predicate results keyed by target
 */
export async function executeChecksByLegalTargets(
  bindings: readonly CheckBinding[],
  input: Parameters<typeof evaluateLegalTargets>[1],
): Promise<Partial<Record<ChangeState, readonly CheckResult[]>>> {
  return (await evaluateLegalTargets(bindings, input)).checksByTarget
}
