import { type GraphStore } from '../ports/graph-store.js'
import { type TraversalOptions } from '../value-objects/traversal-options.js'
import { type TraversalResult } from '../value-objects/traversal-result.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type Relation } from '../value-objects/relation.js'
import { RelationType } from '../value-objects/relation-type.js'

const TRAVERSAL_RELATION_TYPES = [
  RelationType.Calls,
  RelationType.Constructs,
  RelationType.UsesType,
  RelationType.Extends,
  RelationType.Implements,
  RelationType.Overrides,
] as const

/**
 * Collects outgoing traversal relations for a batch of symbols.
 * @param store - The graph store to query.
 * @param symbolIds - Symbol identifiers to inspect.
 * @returns Outgoing relations grouped by inspected symbol id.
 */
async function getOutgoingRelationsBatch(
  store: GraphStore,
  symbolIds: readonly string[],
): Promise<Map<string, Relation[]>> {
  const relationMap = new Map<string, Relation[]>()
  const relations = await store.getOutgoingSymbolRelations(symbolIds, TRAVERSAL_RELATION_TYPES)
  for (const relation of relations) {
    const grouped = relationMap.get(relation.source)
    if (grouped === undefined) relationMap.set(relation.source, [relation])
    else grouped.push(relation)
  }
  return relationMap
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
  const includeFiles = options?.includeFiles ?? true
  const visited = new Set<string>([symbolId])
  const visitedFiles = new Set<string>()

  const levels = new Map<number, SymbolNode[]>()
  let currentIds = [symbolId]
  let truncated = false

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextIds: string[] = []
    const nextIdSet = new Set<string>()
    const relationMap = await getOutgoingRelationsBatch(store, currentIds)

    for (const id of currentIds) {
      const relations = relationMap.get(id) ?? []
      for (const rel of relations) {
        if (!visited.has(rel.target) && !nextIdSet.has(rel.target)) {
          nextIdSet.add(rel.target)
          nextIds.push(rel.target)
        }
      }
    }

    if (includeFiles) {
      const symbols = await store.getSymbolsByIds(currentIds)
      const filePaths = new Set(
        symbols.map((s) => s?.filePath).filter((p): p is string => p !== undefined),
      )

      for (const fp of filePaths) {
        if (!visitedFiles.has(fp)) {
          visitedFiles.add(fp)
          const importRelations = await store.getImportees(fp)
          for (const rel of importRelations) {
            const importedFile = rel.target
            const exportedSymbols = await store.getExportedSymbols(importedFile)
            for (const sym of exportedSymbols) {
              if (!visited.has(sym.id) && !nextIdSet.has(sym.id)) {
                nextIdSet.add(sym.id)
                nextIds.push(sym.id)
              }
            }
          }
        }
      }
    }

    const levelSymbols: SymbolNode[] = await store.getSymbolsByIds(nextIds)
    const resolvedNextIds = levelSymbols.map((symbol) => symbol.id)
    for (const nextId of resolvedNextIds) visited.add(nextId)

    if (levelSymbols.length > 0) {
      levels.set(depth, levelSymbols)
    }

    if (resolvedNextIds.length === 0) {
      break
    }

    currentIds = resolvedNextIds

    if (depth === maxDepth && resolvedNextIds.length > 0) {
      const nextRelations = await getOutgoingRelationsBatch(store, resolvedNextIds)
      let hasMore = false
      for (const relations of nextRelations.values()) {
        if (relations.some((r) => !visited.has(r.target))) {
          hasMore = true
          break
        }
      }

      if (!hasMore && includeFiles) {
        const nextSymbols = await store.getSymbolsByIds(resolvedNextIds)
        const nextFilePaths = new Set(
          nextSymbols.map((s) => s?.filePath).filter((p): p is string => p !== undefined),
        )
        for (const fp of nextFilePaths) {
          if (!visitedFiles.has(fp)) {
            const importRelations = await store.getImportees(fp)
            if (importRelations.length > 0) {
              hasMore = true
              break
            }
          }
        }
      }

      if (hasMore) {
        truncated = true
      }
    }
  }

  let totalCount = 0
  for (const symbols of levels.values()) {
    totalCount += symbols.length
  }

  return { root: symbolId, levels, totalCount, truncated }
}
