import { CHECK_LABELS, skip, type Check, type CheckResult } from '../services/transition-checks.js'

/**
 * Target-enter `run:` hooks. Domain `execute` is always skip; application `createHookPre` runs `RunStepHooks`.
 *
 * @returns Skip (status never waits on hooks)
 */
export function run(): CheckResult {
  return skip('hook.pre', 'effect')
}

/** Reusable `hook.pre` effect. Registry bindings decide when application execute runs it. */
export const hookPre: Check = {
  id: 'hook.pre',
  label: CHECK_LABELS['hook.pre'],
  kind: 'effect',
  execute: () => Promise.resolve(skip('hook.pre', 'effect')),
}
