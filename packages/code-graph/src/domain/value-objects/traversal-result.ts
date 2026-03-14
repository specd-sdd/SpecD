import { type SymbolNode } from './symbol-node.js'

/**
 * Result of a graph traversal containing symbols grouped by depth level.
 */
export interface TraversalResult {
  readonly root: string
  readonly levels: ReadonlyMap<number, readonly SymbolNode[]>
  readonly totalCount: number
  readonly truncated: boolean
}
