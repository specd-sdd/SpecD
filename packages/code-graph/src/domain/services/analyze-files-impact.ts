import { type GraphStore } from '../ports/graph-store.js'
import { type AffectedSymbol, type FileImpactResult } from '../value-objects/impact-result.js'
import { maxRisk, type RiskLevel } from '../value-objects/risk-level.js'
import { analyzeFileImpactDetails, collectCoveringSpecs } from './analyze-file-impact.js'
import { type ImpactResolutionProvider } from './analyze-impact.js'

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
 * @param resolve - Optional provider of pre-resolved logical selectors.
 * @returns The aggregated multi-file impact result.
 */
export async function analyzeFilesImpact(
  store: GraphStore,
  filePaths: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
): Promise<FileImpactResult> {
  const details = await Promise.all(
    filePaths.map((fp) => analyzeFileImpactDetails(store, fp, direction, maxDepth, resolve)),
  )
  const results = details.map((detail) => detail.result)

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

  const fileDepths = new Map<string, number>()
  const symbolDepths = new Map<string, number>()
  for (const detail of details) {
    for (const [filePath, depth] of detail.fileDepths) {
      setMinimumDepth(fileDepths, filePath, depth)
    }
    for (const [symbolId, depth] of detail.symbolDepths) {
      setMinimumDepth(symbolDepths, symbolId, depth)
    }
  }

  return {
    target: filePaths.join(', '),
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: overallRisk,
    affectedFiles: [...affectedFileSet].sort(),
    affectedSymbols: [...symbolMap.values()].sort(
      (left, right) =>
        left.depth - right.depth ||
        left.filePath.localeCompare(right.filePath) ||
        left.line - right.line ||
        left.id.localeCompare(right.id),
    ),
    affectedProcesses: [],
    symbols: results,
    coveringSpecs: await collectCoveringSpecs(store, fileDepths, symbolDepths),
  }
}

/**
 * Retains the shallowest observed depth while folding multiple file analyses.
 * @param target - Mutable resource-depth map.
 * @param key - Resource identity.
 * @param depth - Candidate depth.
 */
function setMinimumDepth(target: Map<string, number>, key: string, depth: number): void {
  const existing = target.get(key)
  if (existing === undefined || depth < existing) target.set(key, depth)
}
