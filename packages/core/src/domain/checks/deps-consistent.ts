import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** One extracted-vs-persisted `dependsOn` mismatch. */
export interface DependsOnMismatch {
  /** Spec id that disagreed. */
  readonly specId: string
  /** `dependsOn` extracted from artifacts. */
  readonly extracted: readonly string[]
  /** `dependsOn` persisted on the change manifest. */
  readonly persisted: readonly string[]
}

/** Facts for `deps.consistent`. */
export interface DepsConsistentFacts {
  readonly extractedDependsOnBySpecId: ReadonlyMap<string, readonly string[] | undefined>
  readonly persistedDependsOnBySpecId: ReadonlyMap<string, readonly string[] | undefined>
}

/**
 * True when both arrays contain the same values in order.
 *
 * @param a - Left `dependsOn` (missing treated as `[]` by callers)
 * @param b - Right `dependsOn` (missing treated as `[]` by callers)
 * @returns Whether the two lists agree
 */
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((value, index) => value === b[index])
}

/**
 * Renders a `dependsOn` list for fail messages; empty arrays show as `[]`.
 *
 * @param deps - Dependency ids
 * @returns Bracketed list text
 */
function formatDependsOnList(deps: readonly string[]): string {
  if (deps.length === 0) {
    return '[]'
  }
  return `[${deps.join(', ')}]`
}

/**
 * Shared `deps.consistent` runner (enter-ready and archive via registry bindings).
 *
 * @param facts - Extract vs persisted maps
 * @returns Check result
 */
export function runDepsConsistent(facts: DepsConsistentFacts): CheckResult {
  const mismatches: DependsOnMismatch[] = []
  for (const [specId, extracted] of facts.extractedDependsOnBySpecId) {
    if (extracted === undefined) {
      continue
    }
    const persisted = facts.persistedDependsOnBySpecId.get(specId) ?? []
    if (!arraysEqual(extracted, persisted)) {
      mismatches.push({
        specId,
        extracted,
        persisted,
      })
    }
  }
  if (mismatches.length === 0) {
    return pass('deps.consistent')
  }
  const summary = mismatches
    .map(
      (m) =>
        `${m.specId} (extracted: ${formatDependsOnList(m.extracted)}, persisted: ${formatDependsOnList(m.persisted)})`,
    )
    .join('; ')
  return fail(
    'deps.consistent',
    'DEPS_INCONSISTENT',
    `Extracted dependsOn disagrees with persisted values for: ${summary}`,
    { mismatches, specIds: mismatches.map((m) => m.specId) },
  )
}

/**
 * Predicate body.
 *
 * @param facts - Extract vs persisted maps
 * @returns Check result
 */
export function run(facts: DepsConsistentFacts): CheckResult {
  return runDepsConsistent(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  void ctx
  return Promise.resolve(pass('deps.consistent'))
}

/** Reusable `deps.consistent` check. */
export const depsConsistent: Check = {
  id: 'deps.consistent',
  label: CHECK_LABELS['deps.consistent'],
  kind: 'predicate',
  execute,
}
