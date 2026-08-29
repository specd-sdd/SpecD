import { type Change } from '../../domain/entities/change.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import {
  evaluateLifecycleVerdict,
  type LifecycleDomainVerdict,
  type LifecycleVerdictInput,
} from '../../domain/services/lifecycle-verdict.js'
import { resolveLifecycleNextAction, type LifecycleNextAction } from './lifecycle-guidance.js'

export type { LifecycleNextAction }

/** Full lifecycle verdict including application-layer command guidance. */
export type LifecycleVerdict = LifecycleDomainVerdict & {
  readonly nextAction: LifecycleNextAction
}

/**
 * Evaluates lifecycle state and assembles domain verdict with product next-action guidance.
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
  const nextAction = resolveLifecycleNextAction(
    change,
    domain.nextHop,
    domain.review,
    domain.availableTransitions,
    approvals,
  )
  return {
    ...domain,
    nextAction,
  }
}
