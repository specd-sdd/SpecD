import { run as runDepsConsistent } from '../../domain/checks/deps-consistent.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  type CheckResult,
} from '../../domain/services/transition-checks.js'
import {
  loadArchiveSealedDependsOnBySpecId,
  loadReadyPredicateFacts,
  type ReadyPredicateFactsDeps,
} from '../services/ready-predicate-facts.js'
import { WorkflowCheck } from './workflow-check.js'

/** Ports for `deps.consistent` I/O. */
export type CreateDepsConsistentDeps = ReadyPredicateFactsDeps

/**
 * `deps.consistent` predicate.
 */
class DepsConsistentCheck extends WorkflowCheck {
  private readonly _deps: CreateDepsConsistentDeps

  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'deps.consistent'
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
   * Creates the deps-consistency predicate.
   *
   * @param deps - Extract / workspace ports
   */
  constructor(deps: CreateDepsConsistentDeps) {
    super()
    this._deps = deps
  }

  /**
   * Evaluates this check using constructor ports.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override async execute(ctx: CheckExecutionContext): Promise<CheckResult> {
    const facts = await loadReadyPredicateFacts(this._deps, ctx.change, ctx.schema)
    const persistedDependsOnBySpecId =
      ctx.attempt.scope === 'archive'
        ? await loadArchiveSealedDependsOnBySpecId(this._deps, ctx.change, ctx.schema)
        : facts.persistedDependsOnBySpecId
    return runDepsConsistent({
      extractedDependsOnBySpecId: facts.extractedDependsOnBySpecId,
      persistedDependsOnBySpecId,
    })
  }
}

/**
 * Creates the `deps.consistent` predicate check.
 *
 * @param deps - Extract / workspace ports
 * @returns WorkflowCheck-compatible instance
 */
export function createDepsConsistent(deps: CreateDepsConsistentDeps): Check {
  return new DepsConsistentCheck(deps)
}
