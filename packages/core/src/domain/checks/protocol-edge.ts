import { isValidTransition, type ChangeState } from '../value-objects/change-state.js'
import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'
import { isWorkflowTransitionLegal } from '../services/workflow-topology.js'
import { type Schema } from '../value-objects/schema.js'

/** Facts for `protocol.edge`. */
export interface ProtocolEdgeFacts {
  readonly from: ChangeState
  readonly to: ChangeState
  readonly schema?: Schema
  readonly approvals?: { readonly spec: boolean; readonly signoff: boolean }
}

/**
 * Protocol-edge predicate: validates that transition is permitted by workflow topology
 * (or fallback to `VALID_TRANSITIONS` if schema not supplied).
 *
 * @param facts - Attempt endpoints and optional schema/approvals
 * @returns Pass or `INVALID_TRANSITION`
 */
export function run(facts: ProtocolEdgeFacts): CheckResult {
  const isLegal = facts.schema
    ? isWorkflowTransitionLegal(
        facts.from,
        facts.to,
        facts.schema,
        facts.approvals ?? { spec: false, signoff: false },
      )
    : isValidTransition(facts.from, facts.to)

  if (isLegal) {
    return pass('protocol.edge')
  }
  return fail(
    'protocol.edge',
    'INVALID_TRANSITION',
    `Cannot transition from '${facts.from}' to '${facts.to}'`,
  )
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  if (ctx.attempt.scope !== 'transition') {
    return Promise.resolve(skip('protocol.edge'))
  }
  return Promise.resolve(
    run({
      from: ctx.attempt.from,
      to: ctx.attempt.to,
      schema: ctx.schema,
      ...(ctx.approvals !== undefined ? { approvals: ctx.approvals } : {}),
    }),
  )
}

/** Reusable `protocol.edge` check. Registry bindings decide when it runs. */
export const protocolEdge: Check = {
  id: 'protocol.edge',
  label: CHECK_LABELS['protocol.edge'],
  kind: 'predicate',
  execute,
}
