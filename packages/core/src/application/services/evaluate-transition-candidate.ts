import { type Change } from '../../domain/entities/change.js'
import {
  type CheckAttempt,
  type CheckBinding,
  type CheckProgressEvent,
  type CheckResult,
  resolveEffectiveBindings,
} from '../../domain/services/transition-checks.js'
import { type CheckRegistry } from '../../domain/services/check-registry.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import {
  listBypassedWorkflowSteps,
  type ApprovalGates,
} from '../../domain/services/workflow-topology.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'
import { projectArtifacts, toEffectiveStatusMap } from '../../domain/services/lifecycle-verdict.js'
import {
  buildCheckExecutionContext,
  executeMatchingPredicates,
  transitionAttemptFor,
} from './execute-matching-predicates.js'

const PROTOCOL_EDGE_ID = 'protocol.edge'

/** Input parameters for candidate evaluation. */
export interface TransitionCandidateEvaluationInput {
  readonly change: Change
  readonly schema: Schema
  readonly approvals: ApprovalGates
  readonly target: ChangeState
  /**
   * `projection` evaluates every predicate for status; `execute` evaluates
   * `protocol.edge` first and stops before any other predicate when it fails.
   */
  readonly mode: 'projection' | 'execute'
  readonly baseBindings: readonly CheckBinding[]
  readonly checkRegistry?: CheckRegistry
  readonly skipChecks?: readonly string[]
  readonly effectiveStatusByArtifact?: ReadonlyMap<string, ArtifactStatus>
  readonly validity?: ChangeValidityVerdict
  readonly onCheckProgress?: (event: CheckProgressEvent) => void
  readonly passMemo?: Map<string, unknown>
}

/** Result of candidate evaluation. */
export interface TransitionCandidateEvaluation {
  readonly target: ChangeState
  readonly bypassedSteps: readonly ChangeState[]
  readonly checks: readonly CheckResult[]
  readonly allowed: boolean
  /** Resolved transition + step-skip bindings used for this evaluation. */
  readonly bindings: readonly CheckBinding[]
}

/**
 * Pure application-layer transition candidate evaluator.
 *
 * Evaluates normal target transition predicates and any `scope: 'step-skip'`
 * predicates for bypassed optional steps in pipeline order.
 *
 * Performs no effects, hooks, aggregate mutation, or persistence.
 *
 * @param input - Candidate evaluation parameters
 * @returns Complete evaluation with ordered check results and allowed verdict
 */
export async function evaluateTransitionCandidate(
  input: TransitionCandidateEvaluationInput,
): Promise<TransitionCandidateEvaluation> {
  const from = input.change.state
  const target = input.target
  const passMemo = input.passMemo ?? new Map<string, unknown>()
  const effectiveStatusByArtifact =
    input.effectiveStatusByArtifact ??
    toEffectiveStatusMap(projectArtifacts(input.change, input.schema))

  const bypassedSteps = listBypassedWorkflowSteps(from, target, input.schema, input.approvals)

  const { attempt, along } = transitionAttemptFor(from, target, input.schema, input.approvals)

  const effectiveBindings = resolveEffectiveBindings({
    baseBindings: input.baseBindings,
    schema: input.schema,
    targetStep: target,
    bypassedSteps,
    from,
    along,
    ...(input.checkRegistry !== undefined ? { registry: input.checkRegistry } : {}),
  })

  const targetCtx = buildCheckExecutionContext({
    change: input.change,
    schema: input.schema,
    attempt,
    approvals: input.approvals,
    effectiveStatusByArtifact,
    passMemo,
    ...(input.validity !== undefined ? { validity: input.validity } : {}),
    ...(input.checkRegistry !== undefined ? { checkRegistry: input.checkRegistry } : {}),
    ...(input.skipChecks !== undefined ? { skipChecks: input.skipChecks } : {}),
    ...(input.onCheckProgress !== undefined ? { onCheckProgress: input.onCheckProgress } : {}),
  })

  const predicateOptions = {
    ...(input.skipChecks !== undefined ? { skipChecks: input.skipChecks } : {}),
    ...(input.checkRegistry !== undefined ? { checkRegistry: input.checkRegistry } : {}),
  }

  let protocolChecks: readonly CheckResult[] = []
  let targetBindings = effectiveBindings
  if (input.mode === 'execute') {
    const protocolResult = await executeMatchingPredicates(
      effectiveBindings.filter((binding) => binding.check.id === PROTOCOL_EDGE_ID),
      targetCtx,
      predicateOptions,
    )
    if (!protocolResult.allowed) {
      return {
        target,
        bypassedSteps: [],
        checks: protocolResult.checks,
        allowed: false,
        bindings: effectiveBindings,
      }
    }
    protocolChecks = protocolResult.checks
    targetBindings = effectiveBindings.filter((binding) => binding.check.id !== PROTOCOL_EDGE_ID)
  }

  const targetResult = await executeMatchingPredicates(targetBindings, targetCtx, predicateOptions)

  const checks: CheckResult[] = [...protocolChecks, ...targetResult.checks]

  for (const step of bypassedSteps) {
    const stepAttempt: CheckAttempt = {
      scope: 'step-skip',
      step,
      from,
      to: target,
    }

    const stepCtx = buildCheckExecutionContext({
      change: input.change,
      schema: input.schema,
      attempt: stepAttempt,
      approvals: input.approvals,
      effectiveStatusByArtifact,
      passMemo,
      ...(input.validity !== undefined ? { validity: input.validity } : {}),
      ...(input.checkRegistry !== undefined ? { checkRegistry: input.checkRegistry } : {}),
      ...(input.skipChecks !== undefined ? { skipChecks: input.skipChecks } : {}),
      ...(input.onCheckProgress !== undefined ? { onCheckProgress: input.onCheckProgress } : {}),
    })

    const stepResult = await executeMatchingPredicates(effectiveBindings, stepCtx, predicateOptions)

    checks.push(...stepResult.checks)
  }

  return {
    target,
    bypassedSteps,
    checks,
    allowed: checks.every((check) => check.outcome !== 'fail'),
    bindings: effectiveBindings,
  }
}
