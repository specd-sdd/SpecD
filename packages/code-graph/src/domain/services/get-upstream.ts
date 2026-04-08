import { type GraphStore } from '../ports/graph-store.js'
import { type TraversalOptions } from '../value-objects/traversal-options.js'
import { type TraversalResult } from '../value-objects/traversal-result.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type Relation } from '../value-objects/relation.js'

/**
 * Collects incoming traversal relations for a symbol.
 * @param store - The graph store to query.
 * @param symbolId - The symbol identifier to inspect.
 * @returns Incoming call and hierarchy relations.
 */
async function getIncomingRelations(store: GraphStore, symbolId: string): Promise<Relation[]> {
  const [callers, extenders, implementors, overriders] = await Promise.all([
    store.getCallers(symbolId),
    store.getExtenders(symbolId),
    store.getImplementors(symbolId),
    store.getOverriders(symbolId),
  ])
  return [...callers, ...extenders, ...implementors, ...overriders]
}

/**
 * Collects incoming traversal relations for a batch of symbols.
 * @param store - The graph store to query.
 * @param symbolIds - Symbol identifiers to inspect.
 * @returns Incoming relations grouped by inspected symbol id.
 */
async function getIncomingRelationsBatch(
  store: GraphStore,
  symbolIds: readonly string[],
): Promise<Map<string, Relation[]>> {
  const entries = await Promise.all(
    symbolIds.map(
      async (symbolId) => [symbolId, await getIncomingRelations(store, symbolId)] as const,
    ),
  )
  return new Map(entries)
}

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
    const nextIdSet = new Set<string>()
    const relationMap = await getIncomingRelationsBatch(store, currentIds)

    for (const id of currentIds) {
      const relations = relationMap.get(id) ?? []
      for (const rel of relations) {
        if (!visited.has(rel.source) && !nextIdSet.has(rel.source)) {
          nextIdSet.add(rel.source)
          nextIds.push(rel.source)
        }
      }
    }

    const symbols = await Promise.all(nextIds.map((id) => store.getSymbol(id)))
    const levelSymbols: SymbolNode[] = []
    const resolvedNextIds: string[] = []

    for (let index = 0; index < nextIds.length; index++) {
      const nextId = nextIds[index]
      const symbol = symbols[index]
      if (nextId === undefined || symbol === undefined) continue
      visited.add(nextId)
      levelSymbols.push(symbol)
      resolvedNextIds.push(nextId)
    }

    if (levelSymbols.length > 0) {
      levels.set(depth, levelSymbols)
    }

    if (resolvedNextIds.length === 0) {
      break
    }

    currentIds = resolvedNextIds

    if (depth === maxDepth && resolvedNextIds.length > 0) {
      const nextRelations = await getIncomingRelationsBatch(store, resolvedNextIds)
      for (const relations of nextRelations.values()) {
        if (relations.some((r) => !visited.has(r.source))) {
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
