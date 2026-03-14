import { type GraphStore } from '../ports/graph-store.js'
import { type ImpactResult } from '../value-objects/impact-result.js'
import { computeRiskLevel } from '../value-objects/risk-level.js'
import { getUpstream } from './get-upstream.js'
import { getDownstream } from './get-downstream.js'

/**
 * Analyzes the impact of modifying a symbol by traversing its dependents.
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
  const results = []

  if (direction === 'upstream' || direction === 'both') {
    results.push(await getUpstream(store, target, { maxDepth: 3 }))
  }
  if (direction === 'downstream' || direction === 'both') {
    results.push(await getDownstream(store, target, { maxDepth: 3 }))
  }

  const allSymbolsByDepth = new Map<number, Set<string>>()
  const affectedFileSet = new Set<string>()

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

  const directDependents = allSymbolsByDepth.get(1)?.size ?? 0
  const indirectDependents = allSymbolsByDepth.get(2)?.size ?? 0

  let transitiveDependents = 0
  for (const [depth, ids] of allSymbolsByDepth) {
    if (depth >= 3) {
      transitiveDependents += ids.size
    }
  }

  const totalDependents = directDependents + indirectDependents + transitiveDependents
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
