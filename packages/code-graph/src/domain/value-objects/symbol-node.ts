import { type SymbolKind, isSymbolKind } from './symbol-kind.js'
import { InvalidSymbolKindError } from '../errors/invalid-symbol-kind-error.js'

/**
 * Half-open source range using 1-based lines and 0-based columns.
 */
export interface SourceRange {
  readonly startLine: number
  readonly startColumn: number
  readonly endLine: number
  readonly endColumn: number
}

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
  readonly endLine: number
  readonly endColumn: number
  readonly selectionRange: SourceRange
  /** ID of the enclosing symbol (e.g. class ID for a method). */
  readonly parentId: string | undefined
  readonly comment: string | undefined
}

/**
 * Compares two source positions.
 * @param leftLine - Left 1-based line.
 * @param leftColumn - Left 0-based column.
 * @param rightLine - Right 1-based line.
 * @param rightColumn - Right 0-based column.
 * @returns Negative, zero, or positive according to source order.
 */
function comparePosition(
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number,
): number {
  return leftLine === rightLine ? leftColumn - rightColumn : leftLine - rightLine
}

/**
 * Validates coordinate domains and non-empty half-open ordering.
 * @param range - Source range to validate.
 * @returns Whether the range is a valid non-empty half-open range.
 */
function isValidSourceRange(range: SourceRange): boolean {
  return (
    Number.isInteger(range.startLine) &&
    range.startLine >= 1 &&
    Number.isInteger(range.startColumn) &&
    range.startColumn >= 0 &&
    Number.isInteger(range.endLine) &&
    range.endLine >= 1 &&
    Number.isInteger(range.endColumn) &&
    range.endColumn >= 0 &&
    comparePosition(range.startLine, range.startColumn, range.endLine, range.endColumn) < 0
  )
}

/**
 * Checks whether an outer half-open range contains an inner range.
 * @param outer - Complete construct range.
 * @param inner - Declared-name selection range.
 * @returns Whether inner is fully contained by outer.
 */
function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return (
    comparePosition(outer.startLine, outer.startColumn, inner.startLine, inner.startColumn) <= 0 &&
    comparePosition(inner.endLine, inner.endColumn, outer.endLine, outer.endColumn) <= 0
  )
}

/**
 * Computes a deterministic identifier for a symbol based on its location and kind.
 * @param filePath - The file path containing the symbol.
 * @param kind - The symbol kind.
 * @param name - The symbol name.
 * @param line - The 1-based line number.
 * @param column - The 0-based column offset.
 * @returns The computed symbol id string.
 */
function computeSymbolId(
  filePath: string,
  kind: SymbolKind,
  name: string,
  line: number,
  column: number,
): string {
  return `${filePath}:${kind}:${name}:${line}:${column}`
}

/**
 * Creates a new SymbolNode, validating the kind and computing a deterministic id.
 * @param params - The symbol node properties.
 * @param params.name - The symbol's declared name.
 * @param params.kind - The symbol kind string.
 * @param params.filePath - The file path containing the symbol.
 * @param params.line - The 1-based line number.
 * @param params.column - The 0-based column offset.
 * @param params.endLine - The 1-based construct end line.
 * @param params.endColumn - The 0-based exclusive construct end column.
 * @param params.selectionRange - The contained declared-name range.
 * @param params.comment - Optional raw comment text preceding the symbol.
 * @param params.parentId - Optional ID of the parent symbol (e.g. class for a method).
 * @returns A SymbolNode value object with a computed id.
 * @throws {InvalidSymbolKindError} If the kind string is not a valid SymbolKind.
 * @throws {RangeError} If construct or selection coordinates are invalid.
 */
export function createSymbolNode(params: {
  name: string
  kind: string
  filePath: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  selectionRange?: SourceRange
  parentId?: string | undefined
  comment?: string | undefined
}): SymbolNode {
  if (!isSymbolKind(params.kind)) {
    throw new InvalidSymbolKindError(params.kind)
  }

  const filePath = params.filePath.replaceAll('\\', '/')
  const fallbackEndColumn = params.column + Math.max(1, params.name.length)
  const constructRange: SourceRange = {
    startLine: params.line,
    startColumn: params.column,
    endLine: params.endLine ?? params.line,
    endColumn: params.endColumn ?? fallbackEndColumn,
  }
  const selectionRange = params.selectionRange ?? {
    startLine: params.line,
    startColumn: params.column,
    endLine: params.line,
    endColumn: fallbackEndColumn,
  }

  if (!isValidSourceRange(constructRange)) {
    throw new RangeError('Symbol construct range must be a non-empty half-open source range')
  }
  if (!isValidSourceRange(selectionRange)) {
    throw new RangeError('Symbol selection range must be a non-empty half-open source range')
  }
  if (!containsRange(constructRange, selectionRange)) {
    throw new RangeError('Symbol selection range must be contained by the construct range')
  }

  return {
    id: computeSymbolId(filePath, params.kind, params.name, params.line, params.column),
    name: params.name,
    kind: params.kind,
    filePath,
    line: params.line,
    column: params.column,
    endLine: constructRange.endLine,
    endColumn: constructRange.endColumn,
    selectionRange,
    parentId: params.parentId,
    comment: params.comment,
  }
}
