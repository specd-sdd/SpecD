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

/** Facts for `protocol.edge`. */
export interface ProtocolEdgeFacts {
  readonly from: ChangeState
  readonly to: ChangeState
}

/**
 * Protocol-edge predicate: requested pair must be in `VALID_TRANSITIONS`.
 *
 * @param facts - Attempt endpoints
 * @returns Pass or `INVALID_TRANSITION`
 */
export function run(facts: ProtocolEdgeFacts): CheckResult {
  if (isValidTransition(facts.from, facts.to)) {
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
  return Promise.resolve(run({ from: ctx.attempt.from, to: ctx.attempt.to }))
}

/** Reusable `protocol.edge` check. Registry bindings decide when it runs. */
export const protocolEdge: Check = {
  id: 'protocol.edge',
  label: CHECK_LABELS['protocol.edge'],
  kind: 'predicate',
  execute,
}
