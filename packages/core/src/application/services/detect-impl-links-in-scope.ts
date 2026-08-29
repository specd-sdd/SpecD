import { type Change } from '../../domain/entities/change.js'

/**
 * Result of the archive out-of-scope implementation sidecar detector.
 */
export interface ImplLinksInScopeDetection {
  /** Whether any implementation link targets a spec outside `change.specIds`. */
  readonly blocked: boolean
  /** Spec IDs that would receive sidecar updates outside change scope. */
  readonly outOfScopeSpecIds: readonly string[]
  /** Human-readable failure message when blocked. */
  readonly message?: string
}

/**
 * Filters implementation-link spec IDs that are not in the change's declared scope.
 *
 * Same condition ArchiveChange uses for `preparedPlan.outOfScopeImplementationSpecIds`.
 *
 * @param implementationSpecIds - Spec IDs that would receive implementation sidecar updates
 * @param inScopeSpecIds - Spec IDs in the change's scope
 * @returns Out-of-scope spec IDs
 */
export function collectOutOfScopeImplementationSpecIds(
  implementationSpecIds: Iterable<string>,
  inScopeSpecIds: readonly string[],
): readonly string[] {
  return [...implementationSpecIds].filter((specId) => !inScopeSpecIds.includes(specId))
}

/**
 * Detects whether confirmed implementation links would update sidecars outside change scope.
 *
 * Does not publish. Callers pass the result into `impl.linksInScope` execute.
 *
 * @param change - Active change whose implementation links are inspected
 * @returns Detection result for `impl.linksInScope`
 */
export function detectImplLinksInScope(change: Change): ImplLinksInScopeDetection {
  const linkedSpecIds = new Set(change.implementationLinks.map((link) => link.specId))
  const outOfScopeSpecIds = collectOutOfScopeImplementationSpecIds(linkedSpecIds, change.specIds)
  if (outOfScopeSpecIds.length === 0) {
    return { blocked: false, outOfScopeSpecIds }
  }
  const count = outOfScopeSpecIds.length
  const shown = outOfScopeSpecIds.slice(0, 3)
  const noun = count === 1 ? 'spec' : 'specs'
  const list = count <= 3 ? shown.join(', ') : `examples: ${shown.join(', ')}`
  return {
    blocked: true,
    outOfScopeSpecIds,
    message: `Implementation sidecar updates would touch ${String(count)} ${noun} outside the change "${change.name}" scope (${list}). Re-run with --allow-out-of-scope if intentional.`,
  }
}
