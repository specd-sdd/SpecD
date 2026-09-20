import { run as runImplFilesResolved } from '../../domain/checks/impl-files-resolved.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `impl.filesResolved` predicate.
 */
class ImplFilesResolvedCheck extends WorkflowCheck {
  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'impl.filesResolved'
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
      runImplFilesResolved({
        openTrackedImplementationFiles: ctx.change.trackedImplementationFiles
          .filter((entry) => entry.state === 'open')
          .map((entry) => entry.file),
      }),
    )
  }
}

/**
 * Creates the `impl.filesResolved` predicate check.
 *
 * @returns WorkflowCheck-compatible instance
 */
export function createImplFilesResolved(): Check {
  return new ImplFilesResolvedCheck()
}
