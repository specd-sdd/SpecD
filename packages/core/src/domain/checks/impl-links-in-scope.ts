import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckResult,
} from '../services/transition-checks.js'

/** Facts for `impl.linksInScope`. */
export interface ImplLinksInScopeFacts {
  readonly linksInScopeBlocked: boolean
  readonly linksInScopeMessage?: string
}

/**
 * Shared `impl.linksInScope` runner (exit-implementing and archive via registry bindings).
 * Evaluates purely whether domain invariant holds.
 *
 * @param facts - Scope detector facts
 * @returns Check result
 */
export function runImplLinksInScope(facts: ImplLinksInScopeFacts): CheckResult {
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
 * @param facts - Scope detector facts
 * @returns Check result
 */
export function run(facts: ImplLinksInScopeFacts): CheckResult {
  return runImplLinksInScope(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @returns Check result
 */
function execute(): Promise<CheckResult> {
  return Promise.resolve(
    run({
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
