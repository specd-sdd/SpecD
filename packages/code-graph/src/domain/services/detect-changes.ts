import { type GraphStore } from '../ports/graph-store.js'
import { type ChangeDetectionResult } from '../value-objects/change-detection-result.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type RiskLevel } from '../value-objects/risk-level.js'
import { getUpstream } from './get-upstream.js'

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
 * Detects which symbols and files are affected by changes to a set of files.
 * @param store - The graph store to query.
 * @param changedFiles - The list of file paths that have changed.
 * @returns The change detection result with affected symbols, files, and risk level.
 */
export async function detectChanges(
  store: GraphStore,
  changedFiles: string[],
): Promise<ChangeDetectionResult> {
  const changedSymbols: SymbolNode[] = []
  const affectedSymbolMap = new Map<string, SymbolNode>()
  const affectedFileSet = new Set<string>()
  let overallRisk: RiskLevel = 'LOW'

  for (const filePath of changedFiles) {
    const symbols = await store.findSymbols({ filePath })
    changedSymbols.push(...symbols)

    for (const symbol of symbols) {
      const result = await getUpstream(store, symbol.id, { maxDepth: 3 })
      const totalDependents = result.totalCount
      const directDependents = result.levels.get(1)?.length ?? 0

      // Evaluate risk per symbol using the same thresholds as computeRiskLevel:
      // CRITICAL: 20+ total dependents
      // HIGH: 6+ direct or 10+ total
      // MEDIUM: 3+ direct or any indirect
      if (totalDependents >= 20) {
        overallRisk = maxRisk(overallRisk, 'CRITICAL')
      } else if (directDependents >= 6 || totalDependents >= 10) {
        overallRisk = maxRisk(overallRisk, 'HIGH')
      } else if (directDependents >= 3 || totalDependents > directDependents) {
        overallRisk = maxRisk(overallRisk, 'MEDIUM')
      }

      for (const [, levelSymbols] of result.levels) {
        for (const s of levelSymbols) {
          affectedSymbolMap.set(s.id, s)
          affectedFileSet.add(s.filePath)
        }
      }
    }
  }

  const affectedSymbols = [...affectedSymbolMap.values()]
  const affectedFiles = [...affectedFileSet]

  const summary =
    changedSymbols.length === 0
      ? `No symbols found in ${changedFiles.length} changed file(s).`
      : `${changedSymbols.length} symbol(s) changed across ${changedFiles.length} file(s). ` +
        `${affectedSymbols.length} symbol(s) in ${affectedFiles.length} file(s) may be affected. ` +
        `Risk: ${overallRisk}.`

  return {
    changedFiles,
    changedSymbols,
    affectedSymbols,
    affectedFiles,
    riskLevel: overallRisk,
    summary,
  }
}
