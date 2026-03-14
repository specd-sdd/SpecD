import { type GraphStore } from '../ports/graph-store.js'
import { type FileImpactResult } from '../value-objects/impact-result.js'
import { type RiskLevel } from '../value-objects/risk-level.js'
import { analyzeImpact } from './analyze-impact.js'

const RISK_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
}

/**
 * Returns the higher of two risk levels.
 * @param a - First risk level.
 * @param b - Second risk level.
 * @returns The more severe risk level.
 */
function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b
}

/**
 * Analyzes the combined impact of all symbols within a file.
 * @param store - The graph store to query.
 * @param filePath - The path of the file to analyze.
 * @param direction - The traversal direction: upstream, downstream, or both.
 * @returns The aggregated file impact result across all symbols in the file.
 */
export async function analyzeFileImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
): Promise<FileImpactResult> {
  const symbols = await store.findSymbols({ filePath })
  const symbolResults = await Promise.all(symbols.map((s) => analyzeImpact(store, s.id, direction)))

  const affectedFileSet = new Set<string>()
  let totalDirect = 0
  let totalIndirect = 0
  let totalTransitive = 0
  let overallRisk: RiskLevel = 'LOW'

  for (const result of symbolResults) {
    totalDirect += result.directDependents
    totalIndirect += result.indirectDependents
    totalTransitive += result.transitiveDependents
    overallRisk = maxRisk(overallRisk, result.riskLevel)
    for (const f of result.affectedFiles) {
      affectedFileSet.add(f)
    }
  }

  return {
    target: filePath,
    directDependents: totalDirect,
    indirectDependents: totalIndirect,
    transitiveDependents: totalTransitive,
    riskLevel: overallRisk,
    affectedFiles: [...affectedFileSet],
    affectedProcesses: [],
    symbols: symbolResults,
  }
}
