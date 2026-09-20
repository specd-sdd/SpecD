import { type Check } from '../../domain/services/transition-checks.js'
import { type RunStepHooks } from '../use-cases/run-step-hooks.js'
import { HookEffectCheck } from './hook-effect-shared.js'

/**
 * Creates the `hook.post` effect check.
 *
 * @param deps - RunStepHooks port
 * @param deps.runStepHooks - Hook runner
 * @returns WorkflowCheck-compatible instance
 */
export function createHookPost(deps: { readonly runStepHooks: RunStepHooks }): Check {
  return new HookEffectCheck('hook.post', 'post', deps.runStepHooks)
}
