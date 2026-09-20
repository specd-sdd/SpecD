import { bindingMatches } from '../../domain/services/evaluate-transition-predicates.js'
import {
  isEffectCheck,
  type CheckAttempt,
  type CheckBinding,
  type EffectOnFailure,
  type EffectPipelinePhase,
  type TransitionAlong,
} from '../../domain/services/transition-checks.js'

/** How a failed hook is surfaced. Transition is fail-fast; archive post is fail-soft. */
export type HookEffectFailureMode = 'fail-fast' | 'fail-soft'

/**
 * Effect bindings matching this attempt and pipeline slot, in registry order.
 *
 * @param bindings - Transition or archive binding table
 * @param attempt - Classified attempt
 * @param phase - Use-case persist slot
 * @param along - Classified direction (transitions only)
 * @returns Matching effect rows
 */
export function matchingEffects(
  bindings: readonly CheckBinding[],
  attempt: CheckAttempt,
  phase: EffectPipelinePhase,
  along?: TransitionAlong,
): readonly CheckBinding[] {
  return bindings.filter(
    (binding) =>
      isEffectCheck(binding.check) &&
      binding.phase === phase &&
      bindingMatches(binding, attempt, along),
  )
}

/**
 * Maps binding `onFailure` to the legacy hook failure mode.
 *
 * @param onFailure - Binding failure policy
 * @returns fail-fast for abort, fail-soft for collect
 */
export function hookFailureMode(onFailure: EffectOnFailure | undefined): HookEffectFailureMode {
  return onFailure === 'collect' ? 'fail-soft' : 'fail-fast'
}
