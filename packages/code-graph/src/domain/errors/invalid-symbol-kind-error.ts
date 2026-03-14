import { CodeGraphError } from './code-graph-error.js'

/**
 * Error thrown when an unrecognized symbol kind string is encountered.
 */
export class InvalidSymbolKindError extends CodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'INVALID_SYMBOL_KIND'.
   */
  get code(): string {
    return 'INVALID_SYMBOL_KIND'
  }

  /**
   * Creates a new InvalidSymbolKindError.
   * @param kind - The invalid symbol kind string that was provided.
   */
  constructor(kind: string) {
    super(`Invalid symbol kind: "${kind}"`)
  }
}
