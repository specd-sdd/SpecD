import { run as runSchemaNameMatch } from '../../domain/checks/schema-name-match.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `schema.nameMatch` predicate.
 */
class SchemaNameMatchCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'schema.nameMatch'
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
      runSchemaNameMatch({
        schemaName: ctx.schema.name(),
        changeSchemaName: ctx.change.schemaName,
      }),
    )
  }
}

/**
 * Creates the `schema.nameMatch` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createSchemaNameMatch(): Check {
  return new SchemaNameMatchCheck()
}
