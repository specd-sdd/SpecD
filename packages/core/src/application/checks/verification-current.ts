import { run as runVerificationCurrent } from '../../domain/checks/verification-current.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `verification.current` predicate.
 *
 * Reads `ctx.validity` only. It does not hash files or record evidence.
 */
class VerificationCurrentCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'verification.current'
  }

  /**
   * Predicate vs effect.
   *
   * @returns Check kind
   */
  override get kind(): CheckKind {
    return 'predicate'
  }

  /**
   * Evaluates freshness from the reconciled verdict.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override execute(ctx: CheckExecutionContext) {
    return Promise.resolve(
      runVerificationCurrent({ name: ctx.change.name, validity: ctx.validity }),
    )
  }
}

/**
 * Creates the `verification.current` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createVerificationCurrent(): Check {
  return new VerificationCurrentCheck()
}
