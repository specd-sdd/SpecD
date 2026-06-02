import { type SymbolKind } from './symbol-kind.js'

/**
 * Criteria for querying symbols from the graph store.
 */
export interface SymbolQuery {
  readonly name?: string
  readonly kind?: SymbolKind
  readonly filePath?: string
  /** Multiple file paths to filter by (OR logic). */
  readonly filePaths?: readonly string[]
  /** ID of the parent symbol (e.g. for methods in a class). */
  readonly parentSymbolId?: string
  /** Substring to match within symbol comments. */
  readonly comment?: string
  /** When true, name and comment matching is case sensitive. Defaults to false (case insensitive). */
  readonly caseSensitive?: boolean
}
