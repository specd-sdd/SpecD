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
  const direct = Math.max(0, directDependents)
  const total = Math.max(0, totalDependents)
  const processes = Math.max(0, processCount)
  if (total >= 20 || processes >= 3) {
    return 'CRITICAL'
  }
  if (direct >= 6 || total >= 10) {
    return 'HIGH'
  }
  if (direct >= 3 || total > direct) {
    return 'MEDIUM'
  }
  return 'LOW'
}
