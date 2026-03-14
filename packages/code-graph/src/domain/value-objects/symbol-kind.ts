export const SymbolKind = {
  Function: 'function',
  Class: 'class',
  Method: 'method',
  Variable: 'variable',
  Type: 'type',
  Interface: 'interface',
  Enum: 'enum',
} as const

/**
 * Union type of all valid symbol kind string literals.
 */
export type SymbolKind = (typeof SymbolKind)[keyof typeof SymbolKind]

const SYMBOL_KIND_VALUES = new Set<string>(Object.values(SymbolKind))

/**
 * Checks whether a string is a valid SymbolKind value.
 * @param value - The string to validate.
 * @returns True if the value is a recognized symbol kind.
 */
export function isSymbolKind(value: string): value is SymbolKind {
  return SYMBOL_KIND_VALUES.has(value)
}
