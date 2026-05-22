import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Thrown when a symbol with the same ID already exists in the graph.
 */
export class DuplicateSymbolIdError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'DUPLICATE_SYMBOL_ID'.
   */
  get code(): string {
    return 'DUPLICATE_SYMBOL_ID'
  }

  /**
   * Creates a new DuplicateSymbolIdError.
   * @param id - The duplicate symbol id that was encountered.
   */
  constructor(id: string) {
    super(`Duplicate symbol id: "${id}"`)
  }
}
