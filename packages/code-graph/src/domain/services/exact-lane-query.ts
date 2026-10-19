const QUALIFIED_DOTTED = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/
const QUALIFIED_NATIVE = /^[A-Za-z_$][\w$]*(?:::[A-Za-z_$][\w$]*)+$/

/**
 * Reports whether a query is a canonical id or a recognizably qualified member spelling.
 * Does not resolve a member.
 * @param query - Raw search or impact text.
 * @returns True for `logical|2|`, `::`, or a dotted identifier chain of two or more segments.
 */
export function isExactLaneQuery(query: string): boolean {
  const trimmed = query.trim()
  return (
    trimmed.startsWith('logical|2|') || trimmed.includes('::') || QUALIFIED_DOTTED.test(trimmed)
  )
}

/**
 * Maps one qualified token onto the stored generic dotted spelling.
 * A single `:` is not a member separator.
 * @param token - One whitespace-delimited query token.
 * @returns `Owner.member` (any number of owners), or undefined when the token is not that spelling.
 */
export function qualifiedLookupText(token: string): string | undefined {
  const trimmed = token.trim()
  if (QUALIFIED_DOTTED.test(trimmed)) return trimmed
  if (QUALIFIED_NATIVE.test(trimmed)) return trimmed.replaceAll('::', '.')
  return undefined
}
