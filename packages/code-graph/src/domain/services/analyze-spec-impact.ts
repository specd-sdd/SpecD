import { type GraphStore } from '../ports/graph-store.js'
import { type SpecImpactResult, type AffectedSymbol } from '../value-objects/impact-result.js'
import { computeRiskLevel } from '../value-objects/risk-level.js'

/**
 * Computes requirement-aware impact for a spec using spec, file, and symbol coverage relations.
 *
 * @param store - Graph store to query
 * @param specId - Target spec identifier
 * @param direction - Traversal direction
 * @param maxDepth - Maximum spec traversal depth
 * @returns Requirement-aware spec impact result
 */
export async function analyzeSpecImpact(
  store: GraphStore,
  specId: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
): Promise<SpecImpactResult> {
  const affectedSpecs = new Set<string>()
  const affectedFiles = new Set<string>()
  const affectedSymbols = new Map<string, AffectedSymbol>()
  const visitedSpecs = new Set<string>([specId])
  let currentSpecs = [specId]
  let directDependents = 0
  let indirectDependents = 0
  let transitiveDependents = 0

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextSpecs = new Set<string>()
    for (const current of currentSpecs) {
      const relations: Array<Awaited<ReturnType<GraphStore['getSpecDependencies']>>> = []
      if (direction === 'upstream' || direction === 'both') {
        relations.push(await store.getSpecDependents(current))
      }
      if (direction === 'downstream' || direction === 'both') {
        relations.push(await store.getSpecDependencies(current))
      }
      for (const batch of relations) {
        for (const relation of batch) {
          const candidate = relation.source === current ? relation.target : relation.source
          if (visitedSpecs.has(candidate)) continue
          visitedSpecs.add(candidate)
          nextSpecs.add(candidate)
          affectedSpecs.add(candidate)
        }
      }
    }

    const count = nextSpecs.size
    if (depth === 1) directDependents = count
    else if (depth === 2) indirectDependents = count
    else transitiveDependents += count
    if (count === 0) break
    currentSpecs = [...nextSpecs]
  }

  const coverageSpecIds = new Set<string>([specId, ...affectedSpecs])
  for (const coveredSpecId of coverageSpecIds) {
    const [fileRelations, symbolRelations] = await Promise.all([
      store.getCoveredFiles(coveredSpecId),
      store.getCoveredSymbols(coveredSpecId),
    ])
    for (const relation of fileRelations) {
      affectedFiles.add(relation.target)
    }
    for (const relation of symbolRelations) {
      const symbol = await store.getSymbol(relation.target)
      if (symbol === undefined) continue
      affectedFiles.add(symbol.filePath)
      if (!affectedSymbols.has(symbol.id)) {
        affectedSymbols.set(symbol.id, {
          id: symbol.id,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth: 1,
        })
      }
    }
  }

  const totalDependents = directDependents + indirectDependents + transitiveDependents
  return {
    target: specId,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles: [...affectedFiles].sort(),
    affectedSymbols: [...affectedSymbols.values()].sort((a, b) =>
      a.filePath === b.filePath ? a.line - b.line : a.filePath.localeCompare(b.filePath),
    ),
    affectedProcesses: [],
    affectedSpecs: [...affectedSpecs].sort(),
  }
}
