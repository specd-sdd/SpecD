import { type GraphStore } from '../ports/graph-store.js'
import { type AffectedSymbol, type FileImpactResult } from '../value-objects/impact-result.js'
import { maxRisk, type RiskLevel } from '../value-objects/risk-level.js'
import { analyzeFileImpact } from './analyze-file-impact.js'

/**
 * Analyzes the combined impact of multiple files.
 * Aggregates individual file impact results:
 * - Combines the lists of affected files and symbols (keeping shallowest depth for symbols).
 * - Sums direct, indirect, and transitive dependents counts.
 * - Computes the overall risk level as the maximum risk level among all analyzed files.
 *
 * @param store - The graph store to query.
 * @param filePaths - Array of file paths to analyze.
 * @param direction - Traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @returns The aggregated multi-file impact result.
 */
export async function analyzeFilesImpact(
  store: GraphStore,
  filePaths: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
): Promise<FileImpactResult> {
  const results = await Promise.all(
    filePaths.map((fp) => analyzeFileImpact(store, fp, direction, maxDepth)),
  )

  const affectedFileSet = new Set<string>()
  const rawAffectedSymbols: AffectedSymbol[] = []
  let directDependents = 0
  let indirectDependents = 0
  let transitiveDependents = 0
  let overallRisk: RiskLevel = 'LOW'

  for (const r of results) {
    for (const f of r.affectedFiles) {
      affectedFileSet.add(f)
    }
    rawAffectedSymbols.push(...r.affectedSymbols)
    directDependents += r.directDependents
    indirectDependents += r.indirectDependents
    transitiveDependents += r.transitiveDependents
    overallRisk = maxRisk(overallRisk, r.riskLevel)
  }

  // Deduplicate symbols keeping the shallowest depth
  const symbolMap = new Map<string, AffectedSymbol>()
  for (const s of rawAffectedSymbols) {
    const existing = symbolMap.get(s.id)
    if (!existing || s.depth < existing.depth) {
      symbolMap.set(s.id, s)
    }
  }

  return {
    target: filePaths.join(', '),
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: overallRisk,
    affectedFiles: [...affectedFileSet],
    affectedSymbols: [...symbolMap.values()],
    affectedProcesses: [],
    symbols: results,
  }
}
