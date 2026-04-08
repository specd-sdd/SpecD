import { type GraphStore } from '../ports/graph-store.js'
import { type ImpactResult, type AffectedSymbol } from '../value-objects/impact-result.js'
import { computeRiskLevel } from '../value-objects/risk-level.js'
import { getUpstream } from './get-upstream.js'
import { getDownstream } from './get-downstream.js'

/**
 * Analyzes the impact of modifying a symbol by traversing its dependents.
 * Combines CALLS-based traversal (symbol-level) with IMPORTS-based traversal
 * (file-level, using the symbol's file as the starting point).
 * @param store - The graph store to query.
 * @param target - The id of the symbol to analyze impact for.
 * @param direction - The traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @returns The impact result with dependent counts, risk level, and affected files.
 */
export async function analyzeImpact(
  store: GraphStore,
  target: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
): Promise<ImpactResult> {
  // CALLS-based traversal (symbol-level)
  const results = []
  if (direction === 'upstream' || direction === 'both') {
    results.push(await getUpstream(store, target, { maxDepth }))
  }
  if (direction === 'downstream' || direction === 'both') {
    results.push(await getDownstream(store, target, { maxDepth }))
  }

  const affectedFileSet = new Set<string>()
  const allSymbolsByDepth = new Map<number, Set<string>>()
  const affectedSymbolMap = new Map<string, AffectedSymbol>()

  for (const result of results) {
    for (const [depth, symbols] of result.levels) {
      if (!allSymbolsByDepth.has(depth)) {
        allSymbolsByDepth.set(depth, new Set())
      }
      const depthSet = allSymbolsByDepth.get(depth)!
      for (const symbol of symbols) {
        depthSet.add(symbol.id)
        affectedFileSet.add(symbol.filePath)
        if (!affectedSymbolMap.has(symbol.id)) {
          affectedSymbolMap.set(symbol.id, {
            id: symbol.id,
            name: symbol.name,
            filePath: symbol.filePath,
            line: symbol.line,
            depth,
          })
        }
      }
    }
  }

  // IMPORTS-based traversal (file-level) — tracked separately to avoid
  // conflating file-level and symbol-level dependent counts.
  const filesByDepth = new Map<number, Set<string>>()
  const symbol = await store.getSymbol(target)
  if (symbol) {
    const visited = new Set<string>([symbol.filePath])
    let currentFiles = [symbol.filePath]

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFiles: string[] = []

      for (const fp of currentFiles) {
        const relations = []
        if (direction === 'upstream' || direction === 'both') {
          relations.push(...(await store.getImporters(fp)))
        }
        if (direction === 'downstream' || direction === 'both') {
          relations.push(...(await store.getImportees(fp)))
        }

        for (const rel of relations) {
          const file = rel.source === fp ? rel.target : rel.source
          if (!visited.has(file)) {
            visited.add(file)
            nextFiles.push(file)
            affectedFileSet.add(file)

            if (!filesByDepth.has(depth)) {
              filesByDepth.set(depth, new Set())
            }
            filesByDepth.get(depth)!.add(file)
          }
        }
      }

      if (nextFiles.length === 0) break
      currentFiles = nextFiles
    }
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const files = [...(filesByDepth.get(depth) ?? new Set<string>())].sort()
    if (files.length === 0) continue

    const baselineAffectedIds = new Set(affectedSymbolMap.keys())
    const nextSymbols = await collectImportedFileSymbols(store, files, baselineAffectedIds, depth)

    for (const symbol of nextSymbols) {
      const existing = affectedSymbolMap.get(symbol.id)
      if (!existing || symbol.depth < existing.depth) {
        affectedSymbolMap.set(symbol.id, symbol)
      }
    }
  }

  // Take the larger of symbol-level or file-level counts per depth
  const symbolDirect = allSymbolsByDepth.get(1)?.size ?? 0
  const symbolIndirect = allSymbolsByDepth.get(2)?.size ?? 0
  let symbolTransitive = 0
  for (const [depth, ids] of allSymbolsByDepth) {
    if (depth >= 3) symbolTransitive += ids.size
  }

  const fileDirect = filesByDepth.get(1)?.size ?? 0
  const fileIndirect = filesByDepth.get(2)?.size ?? 0
  let fileTransitive = 0
  for (const [depth, ids] of filesByDepth) {
    if (depth >= 3) fileTransitive += ids.size
  }

  const directDependents = Math.max(symbolDirect, fileDirect)
  const indirectDependents = Math.max(symbolIndirect, fileIndirect)
  const transitiveDependents = Math.max(symbolTransitive, fileTransitive)
  const totalDependents = directDependents + indirectDependents + transitiveDependents
  // TODO: wire affectedProcesses count once execution flow tracking is implemented
  const riskLevel = computeRiskLevel(directDependents, totalDependents, 0)
  const affectedFiles = [...affectedFileSet].sort()
  const affectedSymbols = [...affectedSymbolMap.values()].sort(compareAffectedSymbols)

  return {
    target,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel,
    affectedFiles,
    affectedSymbols,
    affectedProcesses: [],
  }
}

/**
 * Resolves affected symbols for imported files deterministically, using the
 * already-affected symbol set as a fixed seed for the current depth.
 *
 * When a file contains symbols directly connected to the seed set via `CALLS`,
 * the entire connected call subgraph inside that file is treated as affected.
 * If no such seed is found, the file falls back to its exported symbols.
 *
 * @param store - The graph store to query.
 * @param files - Imported files reached at the current depth.
 * @param affectedIds - Symbols already known to be affected before this depth.
 * @param depth - The import-traversal depth being processed.
 * @returns Deterministically resolved affected symbols for the current depth.
 */
async function collectImportedFileSymbols(
  store: GraphStore,
  files: readonly string[],
  affectedIds: ReadonlySet<string>,
  depth: number,
): Promise<AffectedSymbol[]> {
  const results: AffectedSymbol[] = []

  for (const file of files) {
    const fileSymbols = await store.findSymbols({ filePath: file })
    if (fileSymbols.length === 0) continue

    const fileSymbolIds = new Set(fileSymbols.map((symbol) => symbol.id))
    const adjacency = new Map<string, Set<string>>()
    const directSeeds = new Set<string>()

    for (const symbol of fileSymbols) {
      const [callers, callees] = await Promise.all([
        store.getCallers(symbol.id),
        store.getCallees(symbol.id),
      ])

      const neighbors = new Set<string>()

      for (const relation of callers) {
        if (affectedIds.has(relation.source)) {
          directSeeds.add(symbol.id)
        }
        if (fileSymbolIds.has(relation.source)) {
          neighbors.add(relation.source)
        }
      }

      for (const relation of callees) {
        if (affectedIds.has(relation.target)) {
          directSeeds.add(symbol.id)
        }
        if (fileSymbolIds.has(relation.target)) {
          neighbors.add(relation.target)
        }
      }

      adjacency.set(symbol.id, neighbors)
    }

    if (directSeeds.size === 0) {
      const exported = await store.getExportedSymbols(file)
      for (const symbol of exported) {
        results.push({
          id: symbol.id,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth,
        })
      }
      continue
    }

    const byId = new Map(fileSymbols.map((symbol) => [symbol.id, symbol]))
    const queue = [...directSeeds].sort()
    const visited = new Set<string>()

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (currentId === undefined || visited.has(currentId)) continue
      visited.add(currentId)

      const symbol = byId.get(currentId)
      if (symbol !== undefined) {
        results.push({
          id: symbol.id,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth,
        })
      }

      const neighbors = adjacency.get(currentId)
      if (neighbors === undefined) continue
      for (const neighborId of [...neighbors].sort()) {
        if (!visited.has(neighborId)) {
          queue.push(neighborId)
        }
      }
    }
  }

  return results
}

/**
 * Provides a stable ordering for affected symbols across graph-store backends.
 * @param left - First affected symbol to compare.
 * @param right - Second affected symbol to compare.
 * @returns Negative when `left` sorts before `right`, positive when after, or 0 when equal.
 */
function compareAffectedSymbols(left: AffectedSymbol, right: AffectedSymbol): number {
  return (
    left.depth - right.depth ||
    left.filePath.localeCompare(right.filePath) ||
    left.line - right.line ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}
