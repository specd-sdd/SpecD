import { type GraphStore } from '../ports/graph-store.js'
import { type ImpactResult } from '../value-objects/impact-result.js'
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
 * @returns The impact result with dependent counts, risk level, and affected files.
 */
export async function analyzeImpact(
  store: GraphStore,
  target: string,
  direction: 'upstream' | 'downstream' | 'both',
): Promise<ImpactResult> {
  // CALLS-based traversal (symbol-level)
  const results = []
  if (direction === 'upstream' || direction === 'both') {
    results.push(await getUpstream(store, target, { maxDepth: 3 }))
  }
  if (direction === 'downstream' || direction === 'both') {
    results.push(await getDownstream(store, target, { maxDepth: 3 }))
  }

  const affectedFileSet = new Set<string>()
  const allSymbolsByDepth = new Map<number, Set<string>>()

  for (const result of results) {
    for (const [depth, symbols] of result.levels) {
      if (!allSymbolsByDepth.has(depth)) {
        allSymbolsByDepth.set(depth, new Set())
      }
      const depthSet = allSymbolsByDepth.get(depth)!
      for (const symbol of symbols) {
        depthSet.add(symbol.id)
        affectedFileSet.add(symbol.filePath)
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

    for (let depth = 1; depth <= 3; depth++) {
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

  return {
    target,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel,
    affectedFiles: [...affectedFileSet],
    affectedProcesses: [],
  }
}
