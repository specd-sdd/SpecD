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

/** Facts for `verification.current`. */
export interface VerificationCurrentFacts {
  readonly name: string
  readonly validity: ChangeValidityVerdict | undefined
}

/**
 * Verification freshness predicate. Bindings restrict it to `verifying -> done`.
 *
 * The check reads the reconciled verdict and does not touch the filesystem.
 *
 * @param facts - Change name and optional reconciled verdict
 * @returns Pass, skip, or a verification failure with the start command
 */
export function run(facts: VerificationCurrentFacts): CheckResult {
  const validity = facts.validity
  if (validity === undefined) {
    return fail(
      'verification.current',
      'VERIFICATION_VALIDITY_UNAVAILABLE',
      'Verification validity is unavailable; refresh status before continuing',
      { command: `specd changes status ${facts.name}` },
    )
  }
  if (validity.verification === 'not-required') {
    return skip('verification.current')
  }
  if (validity.verification === 'valid') {
    return pass('verification.current')
  }
  const command = `specd changes verification start ${facts.name}`
  if (validity.verification === 'absent') {
    return fail(
      'verification.current',
      'VERIFICATION_REQUIRED',
      'Completed verification is required',
      { command },
    )
  }
  if (validity.verification === 'attempt-active') {
    return fail(
      'verification.current',
      'VERIFICATION_IN_PROGRESS',
      'Verification is still in progress',
      { command },
    )
  }
  return fail('verification.current', 'VERIFICATION_STALE', 'Verification evidence is stale', {
    command,
    differences: validity.projectionChanges
      .filter((change) => change.projection === 'verification')
      .flatMap((change) => change.differences),
  })
}

/**
 * Domain stub execute. Application `create*` owns the same runner.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(run({ name: ctx.change.name, validity: ctx.validity }))
}

/** Reusable `verification.current` check. Registry bindings decide when it runs. */
export const verificationCurrent: Check = {
  id: 'verification.current',
  label: CHECK_LABELS['verification.current'],
  kind: 'predicate',
  execute,
}
