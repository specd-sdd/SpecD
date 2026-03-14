/**
 * Severity level indicating how risky a code change is.
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * Computes the risk level based on dependent counts and process participation.
 * @param directDependents - Number of direct (depth-1) dependents.
 * @param totalDependents - Total number of dependents across all depths.
 * @param processCount - Number of execution processes the symbol participates in.
 * @returns The computed risk level.
 */
export function computeRiskLevel(
  directDependents: number,
  totalDependents: number,
  processCount: number,
): RiskLevel {
  if (totalDependents >= 20 || processCount >= 3) {
    return 'CRITICAL'
  }
  if (directDependents >= 6 || totalDependents >= 10) {
    return 'HIGH'
  }
  if (directDependents >= 3 || totalDependents > directDependents) {
    return 'MEDIUM'
  }
  return 'LOW'
}
