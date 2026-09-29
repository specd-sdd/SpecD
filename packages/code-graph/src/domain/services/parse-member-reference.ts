import {
  type LogicalSymbol,
  type ParsedSymbolReference,
  type SymbolPathSegment,
} from '../value-objects/symbol-reference.js'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * Parses a dotted or `::` member spelling into one owner-then-member candidate.
 * Dynamic text and canonical ids produce no candidate.
 * @param text - Human reference text.
 * @returns Zero or one structured candidate.
 */
export function parseDottedMemberReference(text: string): ParsedSymbolReference {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.startsWith('logical|') || /[\s()[\]{}'"`]/.test(trimmed)) {
    return { candidates: [] }
  }
  const separator = trimmed.includes('::') ? '::' : trimmed.includes('.') ? '.' : undefined
  if (separator === undefined) return { candidates: [] }
  const parts = trimmed.split(separator)
  if (parts.length < 2 || parts.some((part) => !IDENTIFIER.test(part))) {
    return { candidates: [] }
  }
  const segments: SymbolPathSegment[] = parts.map((name, index) => ({
    name,
    role: index === parts.length - 1 ? 'member' : index === 0 ? 'type' : 'namespace',
  }))
  return { candidates: [{ segments }] }
}

/**
 * Renders the generic dotted spelling from an owner path and a member name.
 * @param symbol - Logical member.
 * @param ownerPath - Owner simple names from the root.
 * @returns Generic dotted text. Native spelling is supplied by the adapter.
 */
export function renderDottedMemberReference(
  symbol: LogicalSymbol,
  ownerPath: readonly string[],
): { readonly generic: string } {
  return { generic: [...ownerPath, symbol.name].join('.') }
}
