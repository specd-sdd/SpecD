import { type SymbolNode } from './symbol-node.js'
import { type SymbolKind } from './symbol-kind.js'
import { type RiskLevel } from './risk-level.js'

/**
 * A single entry in the hotspot ranking.
 */
export interface HotspotEntry {
  readonly symbol: SymbolNode
  readonly score: number
  readonly directCallers: number
  readonly crossWorkspaceCallers: number
  readonly fileImporters: number
  readonly riskLevel: RiskLevel
}

/**
 * Options for filtering and limiting hotspot results.
 */
export interface HotspotOptions {
  readonly workspace?: string
  readonly kind?: SymbolKind
  readonly filePath?: string
  readonly limit?: number
  readonly minScore?: number
  readonly minRisk?: RiskLevel
  readonly excludePaths?: readonly string[]
  readonly excludeWorkspaces?: readonly string[]
}

/**
 * Result of computing hotspots across the code graph.
 */
export interface HotspotResult {
  readonly entries: readonly HotspotEntry[]
  readonly totalSymbols: number
}
