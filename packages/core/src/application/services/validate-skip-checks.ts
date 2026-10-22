import { type CheckRegistry } from '../../domain/services/check-registry.js'
import { isEffectCheck, type CheckBinding } from '../../domain/services/transition-checks.js'
import {
  CheckNotSkippableError,
  UnknownCheckError,
} from '../../domain/errors/check-registry-errors.js'

/** Reason shown when a hook check is passed in `skipChecks`. */
export const HOOK_CHECK_NOT_SKIPPABLE_REASON =
  'Effect checks (hooks) are governed exclusively by skipHookPhases (CLI: --skip-hooks)'

/** Input for {@link validateSkipChecks}. */
export interface ValidateSkipChecksInput {
  /** Requested bypass ids, in caller order. */
  readonly skipChecks: readonly string[]
  /** Effective bindings resolved for this attempt or operation. */
  readonly effectiveBindings: readonly CheckBinding[]
  /** Registry used to recognize ids that have no binding for this attempt. */
  readonly checkRegistry?: CheckRegistry | undefined
}

/**
 * Validates bypass ids against the resolved bindings and returns them
 * deduplicated, caller order preserved.
 *
 * Rules, per id (compared exactly, case-sensitive):
 * - neither bound for this attempt nor registered → {@link UnknownCheckError}
 * - bound and an effect (hook) → {@link CheckNotSkippableError} with
 *   {@link HOOK_CHECK_NOT_SKIPPABLE_REASON}
 * - bound and not skippable → {@link CheckNotSkippableError}
 * - registered but not bound for this attempt (for example disabled by the schema)
 *   → accepted, no effect
 *
 * The whole request is rejected on the first invalid id, in input order.
 *
 * @param input - Requested ids, resolved bindings, and optional registry
 * @returns The deduplicated ids, in caller order
 * @throws {UnknownCheckError} When an id is neither bound nor registered
 * @throws {CheckNotSkippableError} When an id names a hook or a non-skippable binding
 */
export function validateSkipChecks(input: ValidateSkipChecksInput): readonly string[] {
  const { effectiveBindings, checkRegistry } = input
  const ids = [...new Set(input.skipChecks)]

  for (const checkId of ids) {
    const binding = effectiveBindings.find((b) => b.check.id === checkId)
    const hasCheck = binding !== undefined || (checkRegistry?.has(checkId) ?? false)
    if (!hasCheck) {
      throw new UnknownCheckError(checkId)
    }
    if (binding && isEffectCheck(binding.check)) {
      throw new CheckNotSkippableError(checkId, HOOK_CHECK_NOT_SKIPPABLE_REASON)
    }
    if (binding && !binding.skippable) {
      throw new CheckNotSkippableError(checkId)
    }
  }

  return ids
}
