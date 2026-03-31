import { type GraphStore } from '../ports/graph-store.js'
import { type TraversalOptions } from '../value-objects/traversal-options.js'
import { type TraversalResult } from '../value-objects/traversal-result.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type Relation } from '../value-objects/relation.js'

/**
 * Collects outgoing traversal relations for a symbol.
 * @param store - The graph store to query.
 * @param symbolId - The symbol identifier to inspect.
 * @returns Outgoing call and hierarchy relations.
 */
async function getOutgoingRelations(store: GraphStore, symbolId: string): Promise<Relation[]> {
  const [callees, extendedTargets, implementedTargets, overriddenTargets] = await Promise.all([
    store.getCallees(symbolId),
    store.getExtendedTargets(symbolId),
    store.getImplementedTargets(symbolId),
    store.getOverriddenTargets(symbolId),
  ])
  return [...callees, ...extendedTargets, ...implementedTargets, ...overriddenTargets]
}

/**
 * Traverses the call graph downward to find all callees of a symbol.
 * @param store - The graph store to query.
 * @param symbolId - The id of the symbol to start traversal from.
 * @param options - Optional traversal options such as max depth.
 * @returns A traversal result containing callees grouped by depth level.
 */
export async function getDownstream(
  store: GraphStore,
  symbolId: string,
  options?: TraversalOptions,
): Promise<TraversalResult> {
  const maxDepth = options?.maxDepth ?? 3
  const visited = new Set<string>([symbolId])
  const levels = new Map<number, SymbolNode[]>()
  let currentIds = [symbolId]
  let truncated = false

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextIds: string[] = []
    const levelSymbols: SymbolNode[] = []

    for (const id of currentIds) {
      const relations = await getOutgoingRelations(store, id)
      for (const rel of relations) {
        if (!visited.has(rel.target)) {
          visited.add(rel.target)
          const symbol = await store.getSymbol(rel.target)
          if (symbol) {
            levelSymbols.push(symbol)
            nextIds.push(rel.target)
          }
        }
      }
    }

    if (levelSymbols.length > 0) {
      levels.set(depth, levelSymbols)
    }

    if (nextIds.length === 0) {
      break
    }

    currentIds = nextIds

    if (depth === maxDepth && nextIds.length > 0) {
      for (const id of nextIds) {
        const relations = await getOutgoingRelations(store, id)
        if (relations.some((r) => !visited.has(r.target))) {
          truncated = true
          break
        }
      }
    }
  }

  let totalCount = 0
  for (const symbols of levels.values()) {
    totalCount += symbols.length
  }

  return { root: symbolId, levels, totalCount, truncated }
}
