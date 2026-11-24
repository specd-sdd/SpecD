import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import {
  evaluateLifecycleVerdict,
  isForward,
  pipelinePosition,
  type LifecycleDomainVerdict,
  type LifecycleNextHop,
  type LifecycleVerdictInput,
} from '../../domain/services/lifecycle-verdict.js'
import { type CheckResult } from '../../domain/services/transition-checks.js'
import { resolveWorkflowPipeline } from '../../domain/services/workflow-topology.js'
import {
  resolveLifecycleNextAction,
  type LifecycleActionIntent,
  type LifecycleNextAction,
} from './lifecycle-guidance.js'

export type { LifecycleActionIntent, LifecycleNextAction }

/** Full lifecycle verdict including application-layer host-neutral next-action guidance. */
export type LifecycleVerdict = LifecycleDomainVerdict & {
  readonly nextAction: LifecycleNextAction
}

/**
 * Evaluates lifecycle state and assembles domain verdict with host-neutral next-action guidance.
 *
 * @param change - Active change aggregate
 * @param schema - Workflow schema for the change
 * @param options - Predicate inputs and approval flags
 * @returns Domain lifecycle verdict plus resolved next action
 */
export function evaluateLifecycle(
  change: Change,
  schema: Schema,
  options: LifecycleVerdictInput,
): LifecycleVerdict {
  const approvals = options.approvals ?? { spec: false, signoff: false }
  const domain = evaluateLifecycleVerdict(change, schema, options)
  const hopFailures = selectHopFailures(
    change,
    domain.nextHop,
    domain.validTransitions,
    options.checksByTarget,
    schema,
    approvals,
  )
  const nextAction = resolveLifecycleNextAction(
    change,
    domain.nextHop,
    domain.review,
    domain.availableTransitions,
    approvals,
    schema,
    options.validity,
    hopFailures,
  )
  return {
    ...domain,
    nextAction,
  }
}

/**
 * Selects the failed predicate results of the hop the recommendation waits on:
 * - when `nextHop` targets another state, that target's failed predicates;
 * - when `nextHop` holds in the current state, the failed predicates of the first
 *   forward candidate (ordered by pipeline position) that has failures.
 *
 * @param change - Active change aggregate
 * @param nextHop - Domain next-hop recommendation
 * @param validTransitions - Protocol-legal transition targets
 * @param checksByTarget - Evaluated check results per target state
 * @param schema - Sovereign change schema
 * @param approvals - Configured approval gates
 * @param approvals.spec - Whether spec approval is enabled
 * @param approvals.signoff - Whether signoff approval is enabled
 * @returns Failed predicate results in resolved-binding order
 */
function selectHopFailures(
  change: Change,
  nextHop: LifecycleNextHop,
  validTransitions: readonly ChangeState[],
  checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>>,
  schema: Schema,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
): readonly CheckResult[] {
  if (nextHop.targetStep !== change.state) {
    return failedPredicates(checksByTarget[nextHop.targetStep])
  }

  const pipeline = resolveWorkflowPipeline(schema, approvals)
  const forwardCandidates = validTransitions
    .filter((target) => isForward(change.state, target, schema, approvals))
    .sort((a, b) => pipelinePosition(a, pipeline) - pipelinePosition(b, pipeline))

  for (const target of forwardCandidates) {
    const failures = failedPredicates(checksByTarget[target])
    if (failures.length > 0) {
      return failures
    }
  }
  return []
}

/**
 * Filters a check result array to failed predicate results.
 *
 * @param results - Evaluated check results or `undefined`
 * @returns Failed predicate results
 */
function failedPredicates(results: readonly CheckResult[] | undefined): readonly CheckResult[] {
  if (results === undefined) {
    return []
  }
  return results.filter((result) => result.kind === 'predicate' && result.outcome === 'fail')
}
