import { run as runArchiveArchivable } from '../../domain/checks/archive-archivable.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `archive.archivable` predicate.
 */
class ArchiveArchivableCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'archive.archivable'
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
    return Promise.resolve(runArchiveArchivable(ctx.change))
  }
}

/**
 * Creates the `archive.archivable` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createArchiveArchivable(): Check {
  return new ArchiveArchivableCheck()
}
