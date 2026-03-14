import { type SymbolKind } from './symbol-kind.js'

/**
 * Criteria for querying symbols from the graph store.
 */
export interface SymbolQuery {
  readonly name?: string
  readonly kind?: SymbolKind
  readonly filePath?: string
  /** Substring to match within symbol comments. */
  readonly comment?: string
}
