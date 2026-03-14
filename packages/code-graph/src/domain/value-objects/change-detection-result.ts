import { type SymbolNode } from './symbol-node.js'
import { type RiskLevel } from './risk-level.js'

/**
 * Result of detecting which symbols and files are affected by a set of file changes.
 */
export interface ChangeDetectionResult {
  readonly changedFiles: readonly string[]
  readonly changedSymbols: readonly SymbolNode[]
  readonly affectedSymbols: readonly SymbolNode[]
  readonly affectedFiles: readonly string[]
  readonly riskLevel: RiskLevel
  readonly summary: string
}
