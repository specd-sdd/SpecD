import { run as runWorkspaceReadOnly } from '../../domain/checks/workspace-read-only.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import {
  loadReadyPredicateFacts,
  type ReadyPredicateFactsDeps,
} from '../services/ready-predicate-facts.js'
import { WorkflowCheck } from './workflow-check.js'

/** Ports for `workspace.readOnly` I/O. */
export type CreateWorkspaceReadOnlyDeps = ReadyPredicateFactsDeps

/**
 * `workspace.readOnly` predicate.
 */
class WorkspaceReadOnlyCheck extends WorkflowCheck {
  private readonly _deps: CreateWorkspaceReadOnlyDeps

  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'workspace.readOnly'
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
   * Creates the read-only workspace predicate.
   *
   * @param deps - Workspace ports
   */
  constructor(deps: CreateWorkspaceReadOnlyDeps) {
    super()
    this._deps = deps
  }

  /**
   * Evaluates this check using constructor ports.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override async execute(ctx: CheckExecutionContext) {
    const facts = await loadReadyPredicateFacts(this._deps, ctx.change, ctx.schema)
    return runWorkspaceReadOnly({ ownershipBySpecId: facts.ownershipBySpecId })
  }
}

/**
 * Creates the `workspace.readOnly` predicate check.
 *
 * @param deps - Workspace ports
 * @returns WorkflowCheck-compatible instance
 */
export function createWorkspaceReadOnly(deps: CreateWorkspaceReadOnlyDeps): Check {
  return new WorkspaceReadOnlyCheck(deps)
}
