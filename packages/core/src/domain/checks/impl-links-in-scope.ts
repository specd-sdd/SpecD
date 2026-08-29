import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** Facts for `impl.linksInScope`. */
export interface ImplLinksInScopeFacts {
  readonly allowOutOfScope: boolean
  readonly linksInScopeBlocked: boolean
  readonly linksInScopeMessage?: string
}

/**
 * Shared `impl.linksInScope` runner (exit-implementing and archive via registry bindings).
 *
 * @param facts - Scope detector + skip flag
 * @returns Check result
 */
export function runImplLinksInScope(facts: ImplLinksInScopeFacts): CheckResult {
  if (facts.allowOutOfScope) {
    return skip('impl.linksInScope')
  }
  if (!facts.linksInScopeBlocked) {
    return pass('impl.linksInScope')
  }
  return fail(
    'impl.linksInScope',
    'IMPLEMENTATION_STATE',
    facts.linksInScopeMessage ?? 'Implementation links would update sidecars out of scope',
  )
}

/**
 * Predicate body.
 *
 * @param facts - Scope detector + skip flag
 * @returns Check result
 */
export function run(facts: ImplLinksInScopeFacts): CheckResult {
  return runImplLinksInScope(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(
    run({
      allowOutOfScope: ctx.allowOutOfScope,
      linksInScopeBlocked: false,
    }),
  )
}

/** Reusable `impl.linksInScope` check. */
export const implLinksInScope: Check = {
  id: 'impl.linksInScope',
  label: CHECK_LABELS['impl.linksInScope'],
  kind: 'predicate',
  execute,
}
