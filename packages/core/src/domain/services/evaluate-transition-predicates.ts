import {
  checkMatches,
  classifyAlong,
  isEffectCheck,
  skip,
  type CheckAttempt,
  type CheckBinding,
  type CheckResult,
  type TransitionAlong,
} from './transition-checks.js'
import { type ChangeState } from '../value-objects/change-state.js'
import { type Schema } from '../value-objects/schema.js'

export { runDepsConsistent } from '../checks/deps-consistent.js'
export { runWorkspaceReadOnly } from '../checks/workspace-read-only.js'
export { runImplFilesResolved } from '../checks/impl-files-resolved.js'
export { runImplLinksInScope } from '../checks/impl-links-in-scope.js'

/**
 * Whether a registry binding applies to this classified attempt.
 *
 * @param binding - Registry wiring row
 * @param attempt - Classified transition or archive attempt
 * @param along - Classified direction (transitions only)
 * @returns True when the registry should invoke the check
 */
export function bindingMatches(
  binding: CheckBinding,
  attempt: CheckAttempt,
  along?: TransitionAlong,
): boolean {
  if (along !== undefined && binding.exceptAlong?.includes(along) === true) {
    return false
  }
  return binding.applicability.some((row) => checkMatches(row, attempt))
}

/**
 * Classifies a hop the same way execute/status do.
 *
 * @param from - Current state
 * @param requestedTarget - Requested target
 * @param schema - Active schema
 * @returns Attempt triple
 */
export function transitionAttempt(
  from: ChangeState,
  requestedTarget: ChangeState,
  schema: Schema,
): Extract<CheckAttempt, { scope: 'transition' }> {
  const along = classifyAlong(
    from,
    requestedTarget,
    schema.workflow().map((step) => step.step),
  )
  return { scope: 'transition', from, to: requestedTarget, along }
}

/**
 * Skip rows for unmatched bindings that opt into reporting skip.
 *
 * @param bindings - Binding table
 * @param attempt - Classified attempt
 * @returns Skip results in registry order
 */
export function unmatchedSkipResults(
  bindings: readonly CheckBinding[],
  attempt: CheckAttempt,
): readonly CheckResult[] {
  const along = attempt.scope === 'transition' ? attempt.along : undefined
  return bindings.flatMap((binding) => {
    if (isEffectCheck(binding.check)) {
      return []
    }
    if (bindingMatches(binding, attempt, along)) {
      return []
    }
    if (binding.reportSkipWhenUnmatched === true) {
      return [skip(binding.check.id, binding.check.kind, binding.check.label)]
    }
    return []
  })
}
