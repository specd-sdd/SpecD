import { run as runImplLinksInScope } from '../../domain/checks/impl-links-in-scope.js'
import { type Change } from '../../domain/entities/change.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { type ImplLinksInScopeDetection } from '../services/detect-impl-links-in-scope.js'
import { WorkflowCheck } from './workflow-check.js'

/** Ports for `impl.linksInScope` I/O. */
export interface CreateImplLinksInScopeDeps {
  /** Out-of-scope implementation-link detector. */
  readonly detectImplLinksInScope: (change: Change) => ImplLinksInScopeDetection
}

/**
 * `impl.linksInScope` predicate.
 */
class ImplLinksInScopeCheck extends WorkflowCheck {
  private readonly _detect: (change: Change) => ImplLinksInScopeDetection

  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'impl.linksInScope'
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
   * Creates the in-scope implementation-link predicate.
   *
   * @param deps - Scope detector port
   */
  constructor(deps: CreateImplLinksInScopeDeps) {
    super()
    this._detect = deps.detectImplLinksInScope
  }

  /**
   * Evaluates this check using constructor ports.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override execute(ctx: CheckExecutionContext) {
    const detection = this._detect(ctx.change)
    return Promise.resolve(
      runImplLinksInScope({
        allowOutOfScope: ctx.allowOutOfScope,
        linksInScopeBlocked: detection.blocked,
        ...(detection.message !== undefined ? { linksInScopeMessage: detection.message } : {}),
      }),
    )
  }
}

/**
 * Creates the `impl.linksInScope` predicate check.
 *
 * @param deps - Scope detector port
 * @param deps.detectImplLinksInScope - Out-of-scope implementation-link detector
 * @returns WorkflowCheck-compatible instance
 */
export function createImplLinksInScope(deps: CreateImplLinksInScopeDeps): Check {
  return new ImplLinksInScopeCheck(deps)
}
