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
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { type Change } from '../../domain/entities/change.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'

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
  readonly allowOverlap?: boolean
  readonly allowOutOfScope?: boolean
  readonly skipHookPhases?: readonly string[]
  readonly effectiveStatusByArtifact?: ReadonlyMap<string, ArtifactStatus>
  readonly onCheckProgress?: OnCheckProgress
  readonly passMemo?: Map<string, unknown>
}

/**
 * Builds a {@link CheckExecutionContext} from host fields.
 *
 * @param input - Host attempt fields
 * @returns Context for `check.execute`
 */
export function buildCheckExecutionContext(
  input: BuildCheckExecutionContextInput,
): CheckExecutionContext {
  return {
    change: input.change,
    schema: input.schema,
    attempt: input.attempt,
    approvals: input.approvals,
    allowOverlap: input.allowOverlap === true,
    allowOutOfScope: input.allowOutOfScope === true,
    effectiveStatusByArtifact: input.effectiveStatusByArtifact ?? new Map(),
    ...(input.skipHookPhases !== undefined ? { skipHookPhases: input.skipHookPhases } : {}),
    ...(input.onCheckProgress !== undefined ? { onCheckProgress: input.onCheckProgress } : {}),
    ...(input.passMemo !== undefined ? { passMemo: input.passMemo } : {}),
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
 * Runs matching predicates via `check.execute(ctx)` in binding order.
 *
 * @param bindings - Full binding table
 * @param ctx - Host attempt context
 * @param options - Evaluation options
 * @param options.failFast - Stop after any fail
 * @param options.failFastOn - Stop only when this check id fails
 * @returns Allowed flag and ordered results
 */
export async function executeMatchingPredicates(
  bindings: readonly CheckBinding[],
  ctx: CheckExecutionContext,
  options: { readonly failFast?: boolean; readonly failFastOn?: CheckId } = {},
): Promise<PredicateExecutionResult> {
  const along = ctx.attempt.scope === 'transition' ? ctx.attempt.along : undefined
  const checks: CheckResult[] = []

  for (const binding of matchingPredicates(bindings)) {
    const matches = bindingMatches(binding, ctx.attempt, along)
    if (matches) {
      const result = await executeCheckWithProgress(binding.check, ctx)
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
 * @returns Attempt + along
 */
export function transitionAttemptFor(
  from: ChangeState,
  to: ChangeState,
  schema: Schema,
): {
  readonly attempt: Extract<CheckAttempt, { scope: 'transition' }>
  readonly along: TransitionAlong
} {
  const along = classifyAlong(
    from,
    to,
    schema.workflow().map((step) => step.step),
  )
  return {
    along,
    attempt: { scope: 'transition', from, to, along },
  }
}

/**
 * Executes matching predicates for every protocol-legal target from the current state.
 *
 * @param bindings - Transition binding table
 * @param input - Host fields shared across targets
 * @param input.change - Change being evaluated
 * @param input.schema - Active schema
 * @param input.approvals - Approval gate flags
 * @param input.approvals.spec - Spec-approval gate
 * @param input.approvals.signoff - Signoff gate
 * @param input.effectiveStatusByArtifact - DAG effective statuses
 * @param input.allowOverlap - Optional overlap bypass
 * @param input.allowOutOfScope - Optional impl-scope bypass
 * @param input.passMemo - Shared memo for this GetStatus/TransitionChange pass
 * @returns Predicate results keyed by target
 */
export async function executeChecksByLegalTargets(
  bindings: readonly CheckBinding[],
  input: {
    readonly change: Change
    readonly schema: Schema
    readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
    readonly effectiveStatusByArtifact: ReadonlyMap<string, ArtifactStatus>
    readonly allowOverlap?: boolean
    readonly allowOutOfScope?: boolean
    readonly passMemo?: Map<string, unknown>
  },
): Promise<Partial<Record<ChangeState, readonly CheckResult[]>>> {
  const passMemo = input.passMemo ?? new Map<string, unknown>()
  const checksByTarget: Partial<Record<ChangeState, readonly CheckResult[]>> = {}
  for (const target of VALID_TRANSITIONS[input.change.state]) {
    const { attempt } = transitionAttemptFor(input.change.state, target, input.schema)
    const evaluation = await executeMatchingPredicates(
      bindings,
      buildCheckExecutionContext({
        change: input.change,
        schema: input.schema,
        attempt,
        approvals: input.approvals,
        effectiveStatusByArtifact: input.effectiveStatusByArtifact,
        passMemo,
        ...(input.allowOverlap !== undefined ? { allowOverlap: input.allowOverlap } : {}),
        ...(input.allowOutOfScope !== undefined ? { allowOutOfScope: input.allowOutOfScope } : {}),
      }),
    )
    checksByTarget[target] = evaluation.checks
  }
  return checksByTarget
}
