import { CHECK_LABELS, skip, type Check, type CheckResult } from '../services/transition-checks.js'

/**
 * Source-exit `run:` hooks. Domain `execute` is always skip; application `createHookPost` runs `RunStepHooks`.
 *
 * @returns Skip (status never waits on hooks)
 */
export function run(): CheckResult {
  return skip('hook.post', 'effect')
}

/** Reusable `hook.post` effect. Registry bindings decide when application execute runs it. */
export const hookPost: Check = {
  id: 'hook.post',
  label: CHECK_LABELS['hook.post'],
  kind: 'effect',
  execute: () => Promise.resolve(skip('hook.post', 'effect')),
}
