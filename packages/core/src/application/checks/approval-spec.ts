import { run as runApprovalSpec } from '../../domain/checks/approval-spec.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `approval.spec` predicate.
 */
class ApprovalSpecCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'approval.spec'
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
   * Evaluates this check using constructor ports.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override execute(ctx: CheckExecutionContext) {
    return Promise.resolve(
      runApprovalSpec({ specGateEnabled: ctx.approvals.spec, change: ctx.change }),
    )
  }
}

/**
 * Creates the `approval.spec` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createApprovalSpec(): Check {
  return new ApprovalSpecCheck()
}
