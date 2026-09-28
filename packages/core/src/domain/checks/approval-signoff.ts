import { type Change } from '../entities/change.js'
import { type ChangeValidityVerdict } from '../services/change-validity.js'
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
  readonly validity?: ChangeValidityVerdict
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
  const status = facts.validity?.signoff
  const signed =
    status === 'valid' || (status === undefined && facts.change.activeSignoff !== undefined)
  if (!signed) {
    if (status === 'stale' || status === 'revoked') {
      return fail('approval.signoff', 'APPROVAL_STALE', 'Signoff is stale', { gate: 'signoff' })
    }
    return fail(
      'approval.signoff',
      'APPROVAL_REQUIRED',
      'Signoff is required before entering archivable',
      { gate: 'signoff' },
    )
  }
  const verification = facts.validity?.verification
  if (verification === undefined || verification === 'valid' || verification === 'not-required') {
    return pass('approval.signoff')
  }
  if (verification === 'attempt-active') {
    return fail(
      'approval.signoff',
      'VERIFICATION_IN_PROGRESS',
      'Verification is still in progress',
      { gate: 'signoff' },
    )
  }
  if (verification === 'absent') {
    return fail(
      'approval.signoff',
      'VERIFICATION_REQUIRED',
      'Completed verification is required before signoff',
      { gate: 'signoff' },
    )
  }
  return fail('approval.signoff', 'VERIFICATION_STALE', 'Verification evidence is stale', {
    gate: 'signoff',
  })
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(
    run({
      signoffGateEnabled: ctx.approvals.signoff,
      change: ctx.change,
      ...(ctx.validity !== undefined ? { validity: ctx.validity } : {}),
    }),
  )
}

/** Reusable `approval.signoff` check. Registry bindings decide when it runs. */
export const approvalSignoff: Check = {
  id: 'approval.signoff',
  label: CHECK_LABELS['approval.signoff'],
  kind: 'predicate',
  execute,
}
