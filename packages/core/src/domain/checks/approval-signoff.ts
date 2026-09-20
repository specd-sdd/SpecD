import { type Change } from '../entities/change.js'
import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** Facts for `approval.signoff`. */
export interface ApprovalSignoffFacts {
  readonly signoffGateEnabled: boolean
  readonly change: Change
}

/**
 * Signoff gate. The `done → archivable` forward edge is a registry binding.
 *
 * @param facts - Gate flag and recorded signoff
 * @returns Skip, pass, or `APPROVAL_REQUIRED`
 */
export function run(facts: ApprovalSignoffFacts): CheckResult {
  if (!facts.signoffGateEnabled) {
    return skip('approval.signoff')
  }
  if (facts.change.activeSignoff !== undefined) {
    return pass('approval.signoff')
  }
  return fail(
    'approval.signoff',
    'APPROVAL_REQUIRED',
    'Signoff is required before entering archivable',
    { gate: 'signoff' },
  )
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(run({ signoffGateEnabled: ctx.approvals.signoff, change: ctx.change }))
}

/** Reusable `approval.signoff` check. Registry bindings decide when it runs. */
export const approvalSignoff: Check = {
  id: 'approval.signoff',
  label: CHECK_LABELS['approval.signoff'],
  kind: 'predicate',
  execute,
}
