import { type RiskLevel } from './risk-level.js'

/**
 * Result of analyzing the impact of modifying a single symbol.
 */
export interface AffectedSymbol {
  readonly id: string
  readonly name: string
  readonly filePath: string
  readonly line: number
  readonly depth: number
}

/**
 * Result of analyzing the impact of modifying a single symbol.
 */
export interface ImpactResult {
  readonly target: string
  readonly directDependents: number
  readonly indirectDependents: number
  readonly transitiveDependents: number
  readonly riskLevel: RiskLevel
  readonly affectedFiles: readonly string[]
  readonly affectedSymbols: readonly AffectedSymbol[]
  readonly affectedProcesses: readonly string[]
}

/**
 * Aggregated impact result for all symbols within a file.
 */
export interface FileImpactResult extends ImpactResult {
  readonly symbols: readonly ImpactResult[]
}
