import { type GraphStore } from '../ports/graph-store.js'
import { type TraversalOptions } from '../value-objects/traversal-options.js'
import { type TraversalResult } from '../value-objects/traversal-result.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'

/**
 * Traverses the call graph upward to find all callers of a symbol.
 * @param store - The graph store to query.
 * @param symbolId - The id of the symbol to start traversal from.
 * @param options - Optional traversal options such as max depth.
 * @returns A traversal result containing callers grouped by depth level.
 */
export async function getUpstream(
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
      const callers = await store.getCallers(id)
      for (const rel of callers) {
        if (!visited.has(rel.source)) {
          visited.add(rel.source)
          const symbol = await store.getSymbol(rel.source)
          if (symbol) {
            levelSymbols.push(symbol)
            nextIds.push(rel.source)
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
        const callers = await store.getCallers(id)
        if (callers.some((r) => !visited.has(r.source))) {
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
