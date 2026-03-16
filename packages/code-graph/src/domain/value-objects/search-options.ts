import { type SymbolKind } from './symbol-kind.js'

/**
 * Options for full-text search across symbols and specs.
 * Filters are applied at the store level before LIMIT, not post-query.
 */
export interface SearchOptions {
  readonly query: string
  readonly limit?: number
  readonly kind?: SymbolKind
  readonly filePattern?: string
  readonly workspace?: string
  readonly excludePaths?: readonly string[]
  readonly excludeWorkspaces?: readonly string[]
}
