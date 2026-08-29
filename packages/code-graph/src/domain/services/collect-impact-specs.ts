import { type GraphStore } from '../ports/graph-store.js'
import { type ImpactResultFilter } from '../value-objects/impact-result.js'
import { RelationType } from '../value-objects/relation-type.js'

/**
 * Collects deterministic spec identifiers covering admitted impact evidence.
 *
 * @param store - Graph store that owns coverage admission.
 * @param filePaths - Covered file paths admitted by impact traversal.
 * @param symbolIds - Covered symbol ids admitted by impact traversal.
 * @param filter - Optional provider-owned workspace constraints.
 * @returns Stable-deduplicated covering spec identifiers.
 */
export async function collectImpactSpecIds(
  store: GraphStore,
  filePaths: readonly string[],
  symbolIds: readonly string[],
  filter?: ImpactResultFilter,
): Promise<string[]> {
  const [fileResult, symbolResult] = await Promise.all([
    store.queryImpactFrontier({
      resource: 'spec',
      frontier: [...new Set(filePaths)].sort(),
      direction: 'upstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversFile],
      ...(filter === undefined ? {} : { filter }),
    }),
    store.queryImpactFrontier({
      resource: 'spec',
      frontier: [...new Set(symbolIds)].sort(),
      direction: 'upstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversSymbol],
      ...(filter === undefined ? {} : { filter }),
    }),
  ])

  return [
    ...new Set([...fileResult.specs, ...symbolResult.specs].map((spec) => spec.specId)),
  ].sort()
}
