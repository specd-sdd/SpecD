import { type SymbolKind, isSymbolKind } from './symbol-kind.js'
import { InvalidSymbolKindError } from '../errors/invalid-symbol-kind-error.js'

/**
 * Represents a code symbol (function, class, variable, etc.) in the graph.
 */
export interface SymbolNode {
  readonly id: string
  readonly name: string
  readonly kind: SymbolKind
  readonly filePath: string
  readonly line: number
  readonly column: number
  readonly comment: string | undefined
}

/**
 * Computes a deterministic identifier for a symbol based on its location and kind.
 * @param filePath - The file path containing the symbol.
 * @param kind - The symbol kind.
 * @param name - The symbol name.
 * @param line - The 1-based line number.
 * @returns The computed symbol id string.
 */
function computeSymbolId(filePath: string, kind: SymbolKind, name: string, line: number): string {
  return `${filePath}:${kind}:${name}:${line}`
}

/**
 * Creates a new SymbolNode, validating the kind and computing a deterministic id.
 * @param params - The symbol node properties.
 * @param params.name - The symbol's declared name.
 * @param params.kind - The symbol kind string.
 * @param params.filePath - The file path containing the symbol.
 * @param params.line - The 1-based line number.
 * @param params.column - The 0-based column offset.
 * @param params.comment - Optional raw comment text preceding the symbol.
 * @returns A SymbolNode value object with a computed id.
 * @throws {InvalidSymbolKindError} If the kind string is not a valid SymbolKind.
 */
export function createSymbolNode(params: {
  name: string
  kind: string
  filePath: string
  line: number
  column: number
  comment?: string | undefined
}): SymbolNode {
  if (!isSymbolKind(params.kind)) {
    throw new InvalidSymbolKindError(params.kind)
  }

  const filePath = params.filePath.replaceAll('\\', '/')

  return {
    id: computeSymbolId(filePath, params.kind, params.name, params.line),
    name: params.name,
    kind: params.kind,
    filePath,
    line: params.line,
    column: params.column,
    comment: params.comment,
  }
}
