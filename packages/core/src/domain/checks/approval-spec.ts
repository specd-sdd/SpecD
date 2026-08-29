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

/** Facts for `approval.spec`. */
export interface ApprovalSpecFacts {
  readonly specGateEnabled: boolean
  readonly change: Change
}

/**
 * Spec-approval gate. Delivery edges (`ready → implementing` / `ready → verifying`)
 * are registry bindings, not this runner.
 *
 * @param facts - Gate flag and recorded spec approval
 * @returns Skip, pass, or `APPROVAL_REQUIRED`
 */
export function run(facts: ApprovalSpecFacts): CheckResult {
  if (!facts.specGateEnabled) {
    return skip('approval.spec')
  }
  if (facts.change.activeSpecApproval !== undefined) {
    return pass('approval.spec')
  }
  return fail(
    'approval.spec',
    'APPROVAL_REQUIRED',
    'Spec approval is required before leaving ready',
    { gate: 'spec' },
  )
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(run({ specGateEnabled: ctx.approvals.spec, change: ctx.change }))
}

/** Reusable `approval.spec` check. Registry bindings decide when it runs. */
export const approvalSpec: Check = {
  id: 'approval.spec',
  label: CHECK_LABELS['approval.spec'],
  kind: 'predicate',
  execute,
}
