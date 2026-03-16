import { type GraphStore } from '../ports/graph-store.js'
import { type FileImpactResult, type ImpactResult } from '../value-objects/impact-result.js'
import { type RiskLevel, computeRiskLevel } from '../value-objects/risk-level.js'
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
 * Uses both CALLS (symbol-level) and IMPORTS (file-level) to compute impact.
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
  // Symbol-level impact via CALLS
  const symbols = await store.findSymbols({ filePath })
  const symbolResults = await Promise.all(symbols.map((s) => analyzeImpact(store, s.id, direction)))

  // File-level impact via IMPORTS (BFS)
  const fileImpact = await analyzeFileImportImpact(store, filePath, direction)

  // Merge file-level and symbol-level affected files into a deduped set
  const affectedFileSet = new Set<string>()
  for (const f of fileImpact.affectedFiles) {
    affectedFileSet.add(f)
  }
  for (const result of symbolResults) {
    for (const f of result.affectedFiles) {
      affectedFileSet.add(f)
    }
  }

  // Use the larger of file-level or symbol-level counts per depth
  // File-level counts are already deduped (from BFS); symbol-level
  // sums may overcount shared dependents, so we take the file-level
  // count as the floor and only escalate if symbols reveal more
  const directDependents = Math.max(
    fileImpact.directDependents,
    ...symbolResults.map((r) => r.directDependents),
  )
  const indirectDependents = Math.max(
    fileImpact.indirectDependents,
    ...symbolResults.map((r) => r.indirectDependents),
  )
  const transitiveDependents = Math.max(
    fileImpact.transitiveDependents,
    ...symbolResults.map((r) => r.transitiveDependents),
  )

  let overallRisk = fileImpact.riskLevel
  for (const result of symbolResults) {
    overallRisk = maxRisk(overallRisk, result.riskLevel)
  }

  return {
    target: filePath,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: overallRisk,
    affectedFiles: [...affectedFileSet],
    affectedProcesses: [],
    symbols: symbolResults,
  }
}

/**
 * BFS over IMPORTS relations to find files that depend on the given file.
 * @param store - The graph store to query.
 * @param filePath - The file to analyze.
 * @param direction - upstream (importers), downstream (importees), or both.
 * @returns An impact result based on file-level import relationships.
 */
async function analyzeFileImportImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
): Promise<ImpactResult> {
  const maxDepth = 3
  const visited = new Set<string>([filePath])
  const depthFiles = new Map<number, string[]>()

  let currentFiles = [filePath]

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
        // For upstream (importers): the dependent is rel.source (the file that imports us)
        // For downstream (importees): the dependency is rel.target (the file we import)
        // For both: pick the end that isn't the current file
        const candidate = rel.source === fp ? rel.target : rel.source
        if (!visited.has(candidate)) {
          visited.add(candidate)
          nextFiles.push(candidate)
        }
      }
    }

    if (nextFiles.length > 0) {
      depthFiles.set(depth, nextFiles)
    }

    if (nextFiles.length === 0) break
    currentFiles = nextFiles
  }

  const directDependents = depthFiles.get(1)?.length ?? 0
  const indirectDependents = depthFiles.get(2)?.length ?? 0
  let transitiveDependents = 0
  for (const [depth, files] of depthFiles) {
    if (depth >= 3) transitiveDependents += files.length
  }

  const totalDependents = directDependents + indirectDependents + transitiveDependents
  const affectedFiles: string[] = []
  for (const files of depthFiles.values()) {
    affectedFiles.push(...files)
  }

  return {
    target: filePath,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles,
    affectedProcesses: [],
  }
}
