import { run as runApprovalSignoff } from '../../domain/checks/approval-signoff.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `approval.signoff` predicate.
 */
class ApprovalSignoffCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'approval.signoff'
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
      runApprovalSignoff({ signoffGateEnabled: ctx.approvals.signoff, change: ctx.change }),
    )
  }
}

/**
 * Creates the `approval.signoff` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createApprovalSignoff(): Check {
  return new ApprovalSignoffCheck()
}
