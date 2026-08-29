import { run as runWorkflowRequires } from '../../domain/checks/workflow-requires.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  skip,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `workflow.requires` predicate.
 */
class WorkflowRequiresCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'workflow.requires'
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
      return Promise.resolve(skip('workflow.requires'))
    }
    return Promise.resolve(
      runWorkflowRequires({
        schema: ctx.schema,
        target: ctx.attempt.to,
        effectiveStatusByArtifact: ctx.effectiveStatusByArtifact,
      }),
    )
  }
}

/**
 * Creates the `workflow.requires` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createWorkflowRequires(): Check {
  return new WorkflowRequiresCheck()
}
