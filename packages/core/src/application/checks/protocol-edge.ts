import { run as runProtocolEdge } from '../../domain/checks/protocol-edge.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  skip,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `protocol.edge` predicate.
 */
class ProtocolEdgeCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'protocol.edge'
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
    if (ctx.attempt.scope !== 'transition') {
      return Promise.resolve(skip('protocol.edge'))
    }
    return Promise.resolve(runProtocolEdge({ from: ctx.attempt.from, to: ctx.attempt.to }))
  }
}

/**
 * Creates the `protocol.edge` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createProtocolEdge(): Check {
  return new ProtocolEdgeCheck()
}
